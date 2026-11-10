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
const slidesCSS = read("preview/assets/slides.css");
const slidesJS = read("preview/assets/slides.js");
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

test("Ask about Ram lives in the left nav immediately after Contact", () => {
  assert.match(page, /<a href="#contact">Contact<\/a>\s*<button class="chat-launch"[^>]*data-chat-open[^>]*>Ask about Ram<\/button>/);
  assert.equal((page.match(/data-chat-open/g) || []).length, 1);
  assert.equal((page.match(/class="chat-launch"/g) || []).length, 1);
  const contact = page.indexOf('<a href="#contact">Contact</a>');
  const launch = page.indexOf('data-chat-open');
  const picker = page.indexOf('class="theme-picker"');
  assert.ok(contact !== -1 && launch !== -1 && picker !== -1);
  assert.ok(contact < launch && launch < picker, "launcher should sit after Contact and before the theme picker");
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, /aria-expanded="false"/);
  assert.match(page, /aria-controls="portfolio-chat-panel"/);
  assert.doesNotMatch(css, /\.chat-launch\s*\{[^}]*position:\s*fixed/);
  assert.match(themes, /\.nav \.chat-launch/);
  assert.doesNotMatch(home, /data-chat-open|chat-launch/);
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
  ["How do I book a call with Ram?", "booking"],
  ["Tell me about JPMorgan Chase", "jpmc"],
  ["How long was he at JPMorgan Chase?", "jpmc"],
  ["How long was he at each company?", "experience"],
  ["Where is he based?", "location"],
  ["What is his email?", "contact"],
  ["What skills did he use at First Republic?", "first-republic-skills"],
  ["What skills did he use at JPMorgan?", "jpmc-skills"],
  ["What skills did he use at Corsair?", "corsair-skills"],
  ["What skills did he use at ESP?", "esp-skills"]
]) {
  test(`grounded retrieval — ${question}`, () => {
    const answer = replyTo(question, retrieve);
    assert.equal(answer.kind, "answer", question);
    assert.equal(answer.id, id);
    if (id === "booking") {
      assert.equal(answer.link, "#book");
      assert.match(answer.answer, /https:\/\/cal\.com\/ramvellamsetti\/30min/);
    }
  });
}

test("company total questions are answerable from the guide", () => {
  const cases = [
    ["How long was he at JPMorgan Chase?", "jpmc", "3 years 1 month"],
    ["How long was he at First Republic?", "first-republic", "3 years 3 months"],
    ["How long was he at Corsair?", "corsair", "6 years 9 months"],
    ["How long was he at ESP?", "esp", "7 years 1 month"],
    ["How long was he at each company?", "experience", "6 years 9 months"]
  ];
  for (const [question, id, phrase] of cases) {
    const answer = replyTo(question, retrieve);
    assert.equal(answer.kind, "answer", question);
    assert.equal(answer.id, id, question);
    assert.match(answer.answer, new RegExp(phrase));
  }
});

test("suggested questions all retrieve a grounded answer", () => {
  for (const match of page.matchAll(/data-chat-question>([^<]+)<\/button>/g)) {
    assert.equal(replyTo(match[1], retrieve).kind, "answer", match[1]);
  }
});

test("experience roles list LinkedIn skills with an accessible show-all toggle", () => {
  assert.equal((page.match(/class="exp-skills"/g) || []).length, 4);
  assert.equal((page.match(/class="exp-skill-toggle"/g) || []).length, 6);
  assert.match(page, /Site Reliability &amp; Platform \(2023–2026\)/);
  assert.match(page, /MLOps platform \(2026\)/);
  assert.match(page, /Senior \.NET Engineer \(2013–2017\)/);
  assert.match(page, /Commerce Architect \(2017–2020\)/);
  assert.match(page, /src="experience-skills\.js"/);
  assert.match(page, /aria-expanded="false"/);
  assert.match(page, /aria-controls="skills-frb"/);
  assert.doesNotMatch(home, /exp-skill-toggle/);
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

test("closed slide player dialog stays hidden so the theme picker can be used", () => {
  assert.match(page, /id="slides-player"/);
  assert.match(slidesCSS, /\.slides-player:not\(\[open\]\)\s*\{[^}]*display:\s*none/);
  assert.match(slidesCSS, /\.slides-player\[open\]\s*\{[^}]*display:\s*flex/);
  const base = slidesCSS.match(/\.slides-player\s*\{[^}]*\}/);
  assert.ok(base, "base .slides-player rule is missing");
  assert.doesNotMatch(base[0], /display:\s*flex/);
});

test("theme picker can be closed, and the slide player has working chrome", () => {
  assert.match(page, /data-theme-close/);
  assert.match(page, /aria-label="Close theme menu"/);
  assert.match(themes, /\.theme-menu\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(themeJS, /data-theme-close/);
  assert.match(themeJS, /closeMenu\(true\)/);
  assert.match(themeJS, /event\.key !== "Escape"/);
  assert.match(themeJS, /pointerdown/);
  assert.match(page, /data-slides-shell/);
  assert.match(slidesJS, /data-slides-shell/);
  assert.match(slidesJS, /requestFullscreen/);
  assert.match(slidesJS, /webkitRequestFullscreen/);
  assert.match(slidesJS, /fullscreenEnabled/);
  assert.match(slidesCSS, /:fullscreen/);
  assert.match(page, /aria-label="Previous slide"/);
  assert.match(page, /aria-label="Next slide"/);
  assert.match(page, /data-slides-prev[\s\S]*?<svg[\s\S]*?stroke="currentColor"/);
  assert.match(page, /data-slides-next[\s\S]*?<svg[\s\S]*?stroke="currentColor"/);
  assert.doesNotMatch(page, /data-slides-prev[^>]*>\s*Previous/);
  assert.doesNotMatch(page, /data-slides-next[^>]*>\s*Next/);
});

test("Contact Book a call opens the Cal.com intro call in a new tab", () => {
  const contact = page.match(/<ul class="contact-list">([\s\S]*?)<\/ul>/);
  assert.ok(contact, "contact list is missing");
  const link = contact[1].match(/<a href="https:\/\/cal\.com\/ramvellamsetti\/30min"([^>]*)>/);
  assert.ok(link, "Contact is missing the Cal.com Book a call link");
  assert.match(link[1], /target="_blank"/);
  assert.match(link[1], /rel="noopener noreferrer"/);
  assert.match(
    contact[1],
    /<a href="https:\/\/cal\.com\/ramvellamsetti\/30min"[^>]*>\s*<svg class="contact-icon"[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>\s*Book a call\s*<\/a>/
  );
  const section = page.match(/<section id="book"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(section, "Book a call section is missing");
  const cta = section[1].match(/<a class="button" href="https:\/\/cal\.com\/ramvellamsetti\/30min"([^>]*)>/);
  assert.ok(cta, "Book a call section is missing the Cal.com button");
  assert.match(cta[1], /target="_blank"/);
  assert.match(cta[1], /rel="noopener noreferrer"/);
  assert.doesNotMatch(home, /cal\.com/);
});
