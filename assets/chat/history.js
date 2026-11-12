// One Ask Ram history per visitor, kept only in this browser's localStorage.
// No names or personal data: a random anonymous id plus the questions and answers.
// Nothing here makes a network request; history never leaves the browser.
export const HISTORY_KEY = "ask-ram-history-v1";
export const HISTORY_CAP = 500;

function defaultStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = "__ask-ram-probe__";
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function randomId() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
function cleanMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const question = text(raw.question, 500);
  const answer = text(raw.answer, 4000);
  if (!question || !answer) return null;
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((s) => typeof s === "string").map((s) => s.slice(0, 200)).slice(0, 5) : [];
  const link = typeof raw.link === "string" && /^#[a-z0-9-]+$/.test(raw.link) ? raw.link : "";
  const timestamp = typeof raw.timestamp === "string" ? raw.timestamp.slice(0, 40) : "";
  return { question, answer, sources, link, timestamp };
}

function parse(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || typeof data.visitorId !== "string" || !/^[a-f0-9]{32}$/.test(data.visitorId) || !Array.isArray(data.messages)) return null;
    return { visitorId: data.visitorId, messages: data.messages.map(cleanMessage).filter(Boolean) };
  } catch {
    return null;
  }
}

export function createHistory({ storage = defaultStorage(), cap = HISTORY_CAP, now = () => new Date() } = {}) {
  let state = null;
  let persistent = Boolean(storage);
  if (storage) {
    try {
      const raw = storage.getItem(HISTORY_KEY);
      state = raw === null ? null : parse(raw);
    } catch {
      persistent = false;
    }
  }
  if (!state) state = { visitorId: randomId(), messages: [] };
  state.messages = state.messages.slice(-cap);

  function save() {
    if (!persistent) return false;
    let messages = state.messages;
    for (;;) {
      try {
        storage.setItem(HISTORY_KEY, JSON.stringify({ visitorId: state.visitorId, messages }));
        state.messages = messages;
        return true;
      } catch {
        // Storage full: drop the oldest half and retry; if nothing is left, keep history in memory only.
        if (!messages.length) { persistent = false; return false; }
        messages = messages.slice(Math.ceil(messages.length / 2));
      }
    }
  }

  return {
    get visitorId() { return state.visitorId; },
    get persistent() { return persistent; },
    messages() { return state.messages.map((message) => ({ ...message, sources: [...message.sources] })); },
    append(entry) {
      const message = cleanMessage({ ...entry, timestamp: entry?.timestamp || now().toISOString() });
      if (!message) return false;
      state.messages = [...state.messages, message].slice(-cap);
      save();
      return true;
    },
    clear() {
      state.messages = [];
      if (!persistent) return;
      try { storage.removeItem(HISTORY_KEY); } catch { persistent = false; }
    }
  };
}
