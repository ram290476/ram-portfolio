import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRetriever, isSensitive, replyTo, validKnowledge } from "../preview/assets/chat/chat.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const kb = JSON.parse(read("preview/assets/chat/kb.json"));
const chatJS = read("preview/assets/chat/chat.js");
const css = read("preview/assets/chat/chat.css");
const page = read("preview/index.html");
const home = read("index.html");
const themes = read("preview/styles.css");
const themeJS = read("preview/theme.js");
const retrieve = createRetriever(kb);

test("preview page has one accessible chat widget and the coming-soon page does not", () => {
  assert.equal((home.match(/data-portfolio-chat/g) || []).length, 0);
  assert.equal((home.match(/theme-picker/g) || []).length, 0);
  assert.doesNotMatch(home, /\/preview\//);
  assert.equal((page.match(/data-portfolio-chat/g) || []).length, 1);
  assert.match(page, /src="assets\/chat\/chat\.js"/);
  assert.match(page, /href="assets\/chat\/chat\.css"/);
  assert.match(page, /noindex,\s*nofollow/);
  assert.match(page, /aria-label="Ask about Ram’s experience"/);
  assert.match(page, /<dialog[^>]+aria-modal="true"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /<label[^>]+for="portfolio-chat-input"/);
  assert.match(page, /id="theme-toggle"/);
  assert.match(page, /data-theme-value="editorial"/);
  assert.match(page, /data-theme-value="contrast"/);
});

test("knowledge base is curated, local, and free of private patterns", () => {
  assert.ok(validKnowledge(kb));
  assert.equal(new Set(kb.map((entry) => entry.id)).size, kb.length);
  assert.ok(kb.length >= 12);
  const text = JSON.stringify(kb);
  const banned = [
    new RegExp("\\b" + "G" + "PA\\b"),
    new RegExp("\\b(?:" + ["S", "AT"].join("") + "|" + ["A", "CT"].join("") + "|" + ["G", "RE"].join("") + ")\\b"),
    /\$/,
    /\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/,
    /\b\d{1,6}\s+(?:[\w.-]+\s+){1,3}(?:Street|Avenue|Road|Drive|Lane|Boulevard)\b/
  ];
  for (const pattern of banned) assert.doesNotMatch(text, pattern);
  for (const entry of kb) {
    assert.ok(entry.answer.length < 650, entry.id);
    assert.ok(entry.questions.length >= 2, entry.id);
    assert.match(entry.link, /^#[a-z0-9-]+$/);
  }
});

for (const [question, id] of [
  ["What is his background?", "about"],
  ["What projects has he built?", "projects"],
  ["What skills does he use?", "skills"],
  ["How do I book a call?", "booking"],
  ["Tell me about JPMorgan Chase", "jpmc"],
  ["Where is he based?", "location"],
  ["What is his email?", "contact"]
]) {
  test(`grounded retrieval — ${question}`, () => {
    const answer = replyTo(question, retrieve);
    assert.equal(answer.kind, "answer", question);
    assert.equal(answer.id, id);
    if (id === "booking") assert.equal(answer.link, "#book");
  });
}

test("suggested questions all retrieve a grounded answer", () => {
  for (const match of page.matchAll(/data-chat-question>([^<]+)<\/button>/g)) {
    assert.equal(replyTo(match[1], retrieve).kind, "answer", match[1]);
  }
});

test("private questions are refused before retrieval", () => {
  const questions = [
    "What is his " + "G" + "PA?",
    "What is his " + "S" + "AT score?",
    "What is his phone number?",
    "What is his street address?",
    "What is his " + "family " + "income?",
    "What is his salary?",
    "Tell me about his surgery",
    "How old is he?"
  ];
  for (const question of questions) {
    const answer = replyTo(question, () => { throw new Error("private query entered retrieval"); });
    assert.equal(answer.kind, "privacy", question);
    assert.equal(answer.link, undefined);
    assert.equal(isSensitive(question), true);
  }
  assert.equal(isSensitive("Where is he based?"), false);
  assert.equal(isSensitive("What is his email?"), false);
});

test("unsupported questions are not guessed", () => {
  for (const question of [
    "What is his favorite food?",
    "Did he work at Google?",
    "Did he win a Nobel Prize?",
    "What is his favorite color?"
  ]) assert.equal(replyTo(question, retrieve).kind, "unknown", question);
});

test("greetings do not invent a biography", () => {
  assert.equal(replyTo("Hello!", retrieve).kind, "greeting");
  assert.equal(replyTo("Thank you", retrieve).kind, "greeting");
});

test("chat stays on this origin, with no credentials or saved transcript", () => {
  assert.doesNotMatch(chatJS, /api[_-]?key|localStorage|sessionStorage|sendBeacon|innerHTML|\beval\(/i);
  assert.match(chatJS, /fetch\(new URL\("kb\.json", import\.meta\.url\)/);
  assert.match(chatJS, /credentials: "omit"/);
  assert.match(chatJS, /showModal\(\)/);
  assert.match(chatJS, /addEventListener\("cancel"/);
  assert.match(chatJS, /event\.key !== "Tab"/);
  assert.match(chatJS, /launcher\.focus\(\)/);
  assert.ok(Buffer.byteLength(chatJS) < 20000);
});

test("chat and themes follow the page tokens, motion setting, and contrast themes", () => {
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /width: 100%/);
  assert.match(css, /94dvh/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /var\(--(?:ink|bg|card|cy)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  for (const name of ["editorial", "midnight", "minimal", "gradient", "glass", "contrast"]) {
    assert.match(themes, new RegExp(`data-theme="${name}"`));
  }
  assert.match(themes, /prefers-reduced-motion/);
  assert.match(themeJS, /localStorage\.setItem\("theme"/);
  assert.match(themeJS, /localStorage\.getItem\("theme"\)|allowed\[theme\]/);
  assert.match(page, /localStorage\.getItem\("theme"\)/);
});
