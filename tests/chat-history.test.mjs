import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHistory, HISTORY_CAP, HISTORY_KEY } from "../assets/chat/history.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function memoryStorage(initial = {}, { quota = Infinity } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (String(value).length > quota) { const error = new Error("full"); error.name = "QuotaExceededError"; throw error; }
      data.set(key, String(value));
    },
    removeItem: (key) => { data.delete(key); }
  };
}
const fixedNow = () => new Date("2026-11-11T23:30:00.000Z");
const qa = (n) => ({ question: `Question ${n}?`, answer: `Answer ${n}.`, sources: [`Topic ${n}`], link: "#experience" });

test("append stores one history with an anonymous visitor id and no extra fields", () => {
  const storage = memoryStorage();
  const history = createHistory({ storage, now: fixedNow });
  assert.match(history.visitorId, /^[a-f0-9]{32}$/);
  assert.ok(history.append({ ...qa(1), name: "Someone", email: "x@example.com" }));
  assert.ok(history.append(qa(2)));
  const saved = JSON.parse(storage.getItem(HISTORY_KEY));
  assert.deepEqual(Object.keys(saved).sort(), ["messages", "visitorId"]);
  assert.equal(saved.visitorId, history.visitorId);
  assert.deepEqual(saved.messages[0], { question: "Question 1?", answer: "Answer 1.", sources: ["Topic 1"], link: "#experience", timestamp: "2026-11-11T23:30:00.000Z" });
  assert.equal(saved.messages.length, 2);
  assert.equal(history.append({ question: "", answer: "x" }), false);
});

test("a new page load restores every earlier question and answer in order", () => {
  const storage = memoryStorage();
  const first = createHistory({ storage, now: fixedNow });
  first.append(qa(1));
  first.append(qa(2));
  const again = createHistory({ storage, now: fixedNow });
  assert.equal(again.visitorId, first.visitorId);
  assert.deepEqual(again.messages().map((m) => m.question), ["Question 1?", "Question 2?"]);
  again.append(qa(3));
  assert.deepEqual(createHistory({ storage }).messages().map((m) => m.answer), ["Answer 1.", "Answer 2.", "Answer 3."]);
});

test("the widget restores history when the panel opens and saves each answer", () => {
  const chatJS = read("assets/chat/chat.js");
  assert.match(chatJS, /launcher\.addEventListener\("click", \(\) => \{[\s\S]*?restoreHistory\(\);[\s\S]*?\}\);/);
  assert.match(chatJS, /history\.append\(\{ question: text, answer: answer\.answer/);
  assert.match(read("index.html"), /<button type="button" class="chat-clear" data-chat-clear>Clear history<\/button>/);
});

test("history keeps only the newest 500 messages", () => {
  assert.equal(HISTORY_CAP, 500);
  const storage = memoryStorage();
  const history = createHistory({ storage, now: fixedNow });
  for (let n = 1; n <= 520; n += 1) history.append(qa(n));
  const messages = createHistory({ storage }).messages();
  assert.equal(messages.length, 500);
  assert.equal(messages[0].question, "Question 21?");
  assert.equal(messages.at(-1).question, "Question 520?");
});

test("clear removes the stored history", () => {
  const storage = memoryStorage();
  const history = createHistory({ storage, now: fixedNow });
  history.append(qa(1));
  history.clear();
  assert.deepEqual(history.messages(), []);
  assert.equal(storage.getItem(HISTORY_KEY), null);
  assert.deepEqual(createHistory({ storage }).messages(), []);
});

test("corrupt or tampered JSON starts a fresh history instead of throwing", () => {
  for (const raw of ["{not json", "null", "[]", JSON.stringify({ visitorId: "bad id", messages: [] }), JSON.stringify({ visitorId: "a".repeat(32), messages: "x" })]) {
    const storage = memoryStorage({ [HISTORY_KEY]: raw });
    const history = createHistory({ storage, now: fixedNow });
    assert.deepEqual(history.messages(), [], raw);
    history.append(qa(1));
    assert.equal(JSON.parse(storage.getItem(HISTORY_KEY)).messages.length, 1);
  }
  const mixed = memoryStorage({ [HISTORY_KEY]: JSON.stringify({ visitorId: "b".repeat(32), messages: [qa(1), null, { question: 5 }, { ...qa(2), link: "javascript:alert(1)" }] }) });
  const restored = createHistory({ storage: mixed }).messages();
  assert.deepEqual(restored.map((m) => m.question), ["Question 1?", "Question 2?"]);
  assert.equal(restored[1].link, "");
});

test("works in memory when localStorage is unavailable", () => {
  const history = createHistory({ storage: null, now: fixedNow });
  assert.equal(history.persistent, false);
  history.append(qa(1));
  assert.equal(history.messages().length, 1);
  history.clear();
  assert.equal(history.messages().length, 0);
  const throwing = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); }, removeItem() { throw new Error("SecurityError"); } };
  const blocked = createHistory({ storage: throwing, now: fixedNow });
  assert.ok(blocked.append(qa(1)));
  assert.equal(blocked.messages().length, 1);
  assert.doesNotThrow(() => blocked.clear());
});

test("a full localStorage drops the oldest messages and never throws", () => {
  const storage = memoryStorage({}, { quota: 1500 });
  const history = createHistory({ storage, now: fixedNow });
  for (let n = 1; n <= 40; n += 1) assert.doesNotThrow(() => history.append(qa(n)));
  const saved = JSON.parse(storage.getItem(HISTORY_KEY)).messages;
  assert.ok(saved.length > 0 && saved.length < 40);
  assert.equal(saved.at(-1).question, "Question 40?");
  const tiny = createHistory({ storage: memoryStorage({}, { quota: 10 }), now: fixedNow });
  assert.ok(tiny.append(qa(1)));
  assert.equal(tiny.persistent, false);
  assert.equal(tiny.messages().length, 1);
});

test("history never makes a network request", () => {
  const source = read("assets/chat/history.js");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.|import\(|innerHTML|\beval\(/);
  assert.match(source, /globalThis\.localStorage/);
  assert.doesNotMatch(source, /sessionStorage|document\.cookie/);
});
