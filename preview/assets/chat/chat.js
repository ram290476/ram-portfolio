const STOP = new Set("a an and are as at be been by can did do does for from had has have he her him his how i in into is it me my of on or please she show tell that the their them there these they this to us was were what when where which who why will with would you your about since most".split(" "));
const SYNONYMS = {
  built: "build", builds: "build", made: "build", make: "build", projects: "project",
  skills: "skill", technologies: "skill", tools: "skill",
  works: "work", working: "work", jobs: "work", job: "work", roles: "role", employers: "work",
  certifications: "certification", certified: "certification", certs: "certification",
  clouds: "cloud", dashboards: "dashboard",
  booking: "book", schedule: "book", meetings: "call",
  degrees: "degree", universities: "university", schools: "university"
};
export function tokenize(text) {
  return (String(text).normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [])
    .filter((word) => !STOP.has(word)).map((word) => SYNONYMS[word] || word);
}
const PRIVATE = [
  /\b(?:gpa|grade\s*point|sat|act|psat|gre|gmat|toefl|ielts|test\s+scores?)\b/i,
  /\b(?:phone|telephone|zip\s*code|postcode|postal\s+code|street\s+address|home\s+address)\b/i,
  /\b(?:income|salary|earnings|net\s+worth|household\s+pay)\b/i,
  /\b(?:birthdate|birthday|birth\s+date|how\s+old|his\s+age)\b/i,
  /\b(?:medical|surgery|hospital|hospitalized|diagnosis|illness)\b/i,
  /\b(?:how much|what)\b.{0,24}\b(?:paid|earn|earns|money|pay)\b/i,
  /\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/
];
export function isSensitive(question) { return PRIVATE.some((pattern) => pattern.test(question)); }
export const PRIVACY_REPLY = "I only share the public portfolio. I can’t answer about a phone number, a street address, academic results, standardized exams, pay, or medical details.";
export const UNKNOWN_REPLY = "I don’t know that from the public portfolio, and I won’t guess.";
const SAFE_LINK = /^#[a-z0-9-]+$/;
export function validKnowledge(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) =>
    entry && ["id", "topic", "answer", "link"].every((key) => typeof entry[key] === "string" && entry[key].length > 0)
    && ["questions", "tags"].every((key) => Array.isArray(entry[key]) && entry[key].length > 0 && entry[key].every((item) => typeof item === "string"))
    && SAFE_LINK.test(entry.link));
}
export function createRetriever(entries) {
  if (!validKnowledge(entries)) throw new Error("Invalid portfolio knowledge base");
  const docs = entries.map((entry) => {
    const tokens = tokenize([...entry.questions, ...entry.tags, ...entry.tags, entry.answer].join(" "));
    const counts = new Map();
    for (const word of tokens) counts.set(word, (counts.get(word) || 0) + 1);
    return { entry, counts, length: tokens.length, questions: entry.questions.map((question) => new Set(tokenize(question))) };
  });
  const frequencies = new Map();
  for (const doc of docs) for (const word of doc.counts.keys()) frequencies.set(word, (frequencies.get(word) || 0) + 1);
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length;
  return (question) => {
    const words = [...new Set(tokenize(question))];
    if (!words.length) return null;
    const ranked = docs.map((doc) => {
      let bm25 = 0;
      let matched = 0;
      for (const word of words) {
        const count = doc.counts.get(word) || 0;
        if (!count) continue;
        matched += 1;
        const df = frequencies.get(word) || 0;
        const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        bm25 += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * doc.length / average));
      }
      const questionSimilarity = Math.max(...doc.questions.map((tokens) => {
        const overlap = words.filter((word) => tokens.has(word)).length;
        return 2 * overlap / (words.length + tokens.size || 1);
      }));
      return { entry: doc.entry, score: bm25 + 6 * questionSimilarity, coverage: matched / words.length, questionSimilarity };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best.coverage < 0.75 || best.questionSimilarity < 0.5 || best.score < 2.5) return null;
    if (words.length > 1 && best.coverage < 1) return null;
    return { answer: best.entry.answer, link: best.entry.link, topic: best.entry.topic, id: best.entry.id };
  };
}
export function replyTo(question, retrieve) {
  if (isSensitive(question)) return { kind: "privacy", answer: PRIVACY_REPLY };
  if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening))[!.\s]*$/i.test(question.trim())) {
    return { kind: "greeting", answer: "Hello. Ask about Ram’s experience, projects, skills, or how to book a call. Answers come from the public portfolio, not a generative model." };
  }
  if (/^(?:thanks|thank you|thank you very much)[!.\s]*$/i.test(question.trim())) {
    return { kind: "greeting", answer: "You’re welcome. You can ask about experience, projects, or booking a call." };
  }
  const answer = retrieve(question);
  return answer ? { kind: "answer", ...answer } : { kind: "unknown", answer: UNKNOWN_REPLY };
}

if (typeof document !== "undefined") setupWidget();
function setupWidget() {
  const root = document.querySelector("[data-portfolio-chat]");
  if (!root || root.dataset.chatReady) return;
  root.dataset.chatReady = "true";
  const launcher = root.querySelector("[data-chat-open]");
  const dialog = root.querySelector("dialog");
  const form = root.querySelector("form");
  const input = root.querySelector("input");
  const log = root.querySelector("[data-chat-log]");
  const status = root.querySelector("[data-chat-status]");
  const send = root.querySelector("[data-chat-send]");
  let pending = null;
  let retrieve = null;
  let busy = false;
  async function load() {
    if (retrieve) return retrieve;
    if (!pending) {
      pending = fetch(new URL("kb.json", import.meta.url), { credentials: "omit", mode: "same-origin" })
        .then((response) => { if (!response.ok) throw new Error("Knowledge base unavailable"); return response.json(); })
        .then((data) => (retrieve = createRetriever(data)))
        .catch((error) => { pending = null; throw error; });
    }
    return pending;
  }
  function addMessage(text, who, link) {
    const row = document.createElement("div");
    row.className = `chat-message chat-message--${who}`;
    const label = document.createElement("span");
    label.className = "chat-speaker";
    label.textContent = who === "visitor" ? "You" : "Portfolio guide";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    row.append(label, paragraph);
    if (link) {
      const more = document.createElement("a");
      more.href = link;
      more.textContent = "Read more";
      row.append(more);
    } else if (text === UNKNOWN_REPLY) {
      for (const [name, href] of [["Experience", "#experience"], ["Projects", "#projects"], ["Book a call", "#book"]]) {
        const more = document.createElement("a");
        more.textContent = name;
        more.href = href;
        row.append(more);
      }
    }
    log.append(row);
    while (log.children.length > 40) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function close() {
    dialog.close();
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }
  launcher.addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    launcher.setAttribute("aria-expanded", "true");
    input.focus();
    load().catch(() => { status.textContent = "The guide could not load. Send a question to retry, or use the page sections."; });
  });
  root.querySelector("[data-chat-close]").addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), a[href], [tabindex='0']")].filter((el) => !el.hidden);
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  async function ask(question) {
    const text = question.trim().slice(0, 500);
    if (!text || busy) return;
    busy = true;
    send.disabled = true;
    root.querySelectorAll("[data-chat-question]").forEach((chip) => { chip.disabled = true; });
    addMessage(text, "visitor");
    input.value = "";
    status.textContent = "Looking through the public portfolio…";
    try {
      const answer = isSensitive(text) ? replyTo(text, () => null) : replyTo(text, await load());
      addMessage(answer.answer, "guide", answer.link);
      status.textContent = "";
    } catch {
      addMessage("The guide could not load right now. Please try again, or read the sections on this page.", "guide");
      status.textContent = "No answer was guessed.";
    } finally {
      busy = false;
      send.disabled = false;
      root.querySelectorAll("[data-chat-question]").forEach((chip) => { chip.disabled = false; });
      if (dialog.open) input.focus();
    }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); ask(input.value); });
  root.querySelectorAll("[data-chat-question]").forEach((chip) => chip.addEventListener("click", () => ask(chip.textContent)));
  addMessage("Hello. I’m a small portfolio guide, not a generative model. Ask about Ram’s experience, projects, or skills. I only use the public page.", "guide");
  launcher.hidden = false;
}
