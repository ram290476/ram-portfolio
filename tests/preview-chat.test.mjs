import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRetriever, isSensitive, replyTo, validKnowledge } from "../assets/chat/chat.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const kb = JSON.parse(read("assets/chat/kb.json"));
const chatJS = read("assets/chat/chat.js");
const css = read("assets/chat/chat.css");
const page = read("index.html");
const previewRedirect = read("preview/index.html");
const themes = read("styles.css");
const themeJS = read("theme.js");
const slidesCSS = read("assets/slides.css");
const slidesJS = read("assets/slides.js");
const retrieve = createRetriever(kb);

test("homepage has one accessible chat widget and is indexable", () => {
  assert.equal((page.match(/data-portfolio-chat/g) || []).length, 1);
  assert.match(page, /src="assets\/chat\/chat\.js"/);
  assert.match(page, /href="assets\/chat\/chat\.css"/);
  assert.doesNotMatch(page, /noindex,\s*nofollow/);
  assert.doesNotMatch(page, /\/preview\//);
  assert.match(page, /rel="canonical" href="https:\/\/ram\.vellamsetti\.com\/"/);
  assert.match(previewRedirect, /noindex,\s*nofollow/);
  assert.match(previewRedirect, /location\.replace\("\/" \+ location\.hash\)/);
  assert.match(page, /aria-label="Ask Ram"/);
  assert.match(page, /<h2 id="portfolio-chat-title">Ask Ram<\/h2>/);
  assert.match(page, /<dialog[^>]+aria-modal="true"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /<label[^>]+for="portfolio-chat-input"/);
  assert.match(page, /id="theme-toggle"/);
  assert.match(page, /data-theme-value="editorial"/);
  assert.match(page, /data-theme-value="contrast"/);
});

test("Ask Ram lives in the left nav immediately after Contact", () => {
  assert.doesNotMatch(page, /<nav[^>]*>[\s\S]*href="#book"/);
  assert.match(page, /<a href="#contact"[^>]*>[\s\S]*?Contact<\/a>\s*<button class="chat-launch"[^>]*data-chat-open[^>]*>[\s\S]*?Ask Ram<\/button>/);
  assert.equal((page.match(/data-chat-open/g) || []).length, 1);
  assert.equal((page.match(/class="chat-launch"/g) || []).length, 1);
  const contact = page.indexOf('href="#contact"');
  const launch = page.indexOf('data-chat-open');
  const picker = page.indexOf('class="theme-picker"');
  assert.ok(contact !== -1 && launch !== -1 && picker !== -1);
  assert.ok(contact < launch && launch < picker, "launcher should sit after Contact and before the theme picker");
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, /aria-expanded="false"/);
  assert.match(page, /aria-controls="portfolio-chat-panel"/);
  assert.doesNotMatch(css, /\.chat-launch\s*\{[^}]*position:\s*fixed/);
  assert.match(themes, /\.nav \.chat-launch/);
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
  ["What skills did he use at ESP?", "esp-skills"],
  ["What were his SRE responsibilities at JPMorgan?", "jpmc-sre-resp"],
  ["What were his MLOps platform responsibilities at JPMorgan?", "jpmc-mlops-resp"],
  ["What were his responsibilities at First Republic?", "first-republic-resp"],
  ["What were his responsibilities as a Senior .NET Engineer at Corsair?", "corsair-net-resp"],
  ["What were his responsibilities as Commerce Architect at Corsair?", "corsair-commerce-resp"],
  ["What were his responsibilities at ESP?", "esp-resp"],
  ["What leadership skills does he have?", "skills-cross-cutting"]
]) {
  test(`grounded retrieval — ${question}`, () => {
    const answer = replyTo(question, retrieve);
    assert.equal(answer.kind, "answer", question);
    assert.equal(answer.id, id);
    if (id === "booking") {
      assert.equal(answer.link, "#contact");
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
  const experience = page.match(/<section id="experience"[\s\S]*?<\/section>/)[0];
  assert.equal((experience.match(/class="exp-role-block"/g) || []).length, 6);
  assert.equal((experience.match(/class="exp-skill-toggle"/g) || []).length, 6);
  assert.doesNotMatch(experience, /class="exp-skills"/);
  assert.doesNotMatch(experience, /Skills used/);
  assert.match(page, /Site Reliability &amp; Platform Engineer \(2023–2026\)/);
  assert.match(page, /MLOps platform \(2026\)/);
  assert.match(page, /Senior \.NET Engineer \(2013–2017\)/);
  assert.match(page, /Lead Commerce Architect \(2017–2020\)/);
  assert.match(page, /src="experience-skills\.js"/);
  assert.match(page, /aria-expanded="false"/);
  assert.match(page, /aria-controls="skills-frb"/);
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
  assert.doesNotMatch(page, /<section id="book"/);
  const first = contact[1].match(/<li>[\s\S]*?<a href="([^"]+)"/);
  assert.ok(first, "Contact list is empty");
  assert.equal(first[1], "https://cal.com/ramvellamsetti/30min", "Book a call should be first in Contact");
  const mainJS = read("main.js");
  assert.match(mainJS, /location\.hash !== "#book"/);
  assert.match(mainJS, /#contact/);
});
test("the Experience callout quote has been removed", () => {
  const experience = page.match(/<section id="experience"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(experience, /feature-quote/);
  assert.doesNotMatch(experience, /Keeping systems reliable in production is exactly the skill/);
  assert.doesNotMatch(themes, /feature-quote/);
  assert.equal(replyTo("What is the featured quote?", retrieve).kind, "unknown");
});

test("each Experience role leads with LinkedIn responsibilities, then that role's skills", () => {
  const experience = page.match(/<section id="experience"[\s\S]*?<\/section>/)[0];
  const blocks = [...experience.matchAll(/<article class="exp-role-block"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 6);
  const phrases = [
    "Platform and reliability engineering for Line of Business application teams across AWS and the firm’s private cloud",
    "Re-platformed enterprise MLOps workloads onto AWS SageMaker",
    "Technical lead for the bank's Azure-hosted Sitecore platform",
    "Led migration of the commerce platform to Sitecore 6 and Sitecore 8",
    "Led the SAP Commerce Cloud V2 upgrade end to end in five months",
    "Full-stack engineer on opsInfo, an enterprise environmental and sustainability reporting product",
    "Managed Control-M scheduled job workflows",
    "Championed AI-assisted development with GitHub Copilot and VS Code",
    "Sitecore 9.1 → 10.2 upgrade",
    "Established GDPR data privacy processes",
    "Delivered Oracle ERP and Salesforce CRM integrations",
    "extending the product to 7 languages"
  ];
  for (const phrase of phrases) assert.match(experience, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  for (const block of blocks) {
    const respIdx = block.search(/<div class="exp-resp"/);
    const skillsIdx = block.search(/<ul class="pills exp-skill-chips"/);
    assert.ok(respIdx >= 0, "role is missing a responsibilities block");
    assert.ok(skillsIdx > respIdx, "responsibilities must come before the skills list");
    const list = block.match(/<ul class="exp-resp-list" id="([^"]+)">([\s\S]*?)<\/ul>/);
    assert.ok(list, "role is missing a responsibilities list");
    const items = [...list[2].matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)];
    assert.ok(items.length >= 3, list[1]);
    const visible = items.filter((item) => !/\bexp-resp-more\b/.test(item[1]));
    const hidden = items.filter((item) => /\bexp-resp-more\b/.test(item[1]));
    assert.equal(visible.length, Math.min(3, items.length), list[1]);
    assert.equal(hidden.length, Math.max(0, items.length - 3), list[1]);
    const toggle = block.match(/<button type="button" class="exp-resp-toggle"[^>]*>/);
    if (items.length > 3) {
      assert.ok(toggle, `missing show-more toggle for ${list[1]}`);
      assert.match(toggle[0], /aria-expanded="false"/);
      assert.match(toggle[0], new RegExp(`aria-controls="${list[1]}"`));
      assert.match(block, /class="exp-resp-toggle"[^>]*>Show more/);
    } else {
      assert.equal(toggle, null, `${list[1]} should not have a toggle`);
    }
  }
  assert.doesNotMatch(blocks.find((block) => block.includes('id="resp-esp-list"')), /exp-resp-toggle/);
  assert.match(themes, /\.js \.exp-resp-list:not\(\.is-open\) \.exp-resp-more\s*\{\s*display:\s*none/);
  const skillJS = read("experience-skills.js");
  assert.match(skillJS, /exp-resp-toggle/);
  assert.match(skillJS, /Show more/);
  assert.match(skillJS, /Show less/);
});


test("Personal project and career-overview links open in a new tab", () => {
  const personal = page.match(/<section id="personal-projects"[\s\S]*?<\/section>/);
  assert.ok(personal, "Personal projects section is missing");
  const links = [...personal[0].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const texts = links.map((m) => `${m[2].replace(/\s+/g, " ").trim()} ${m[1]}`);
  const expected = [
    'https://github.com/ram290476/investor-dashboard',
    'https://investor.vellamsetti.com',
    'https://github.com/ram290476/hybrid-cloud-dashboard',
    'https://github.com/ram290476/opsKit',
    'https://github.com/ram290476/credit-union-knowledge-system',
    'https://github.com/ram290476/tasks-api'
  ];
  assert.equal(links.length, 6, "Personal projects should have six repo/live links");
  for (const href of expected) {
    const link = links.find((m) => m[1].includes(href));
    assert.ok(link, `missing ${href}`);
    assert.match(link[1], /target="_blank"/, href);
    assert.match(link[1], /rel="[^"]*\bnoopener\b[^"]*"/, href);
    assert.match(link[1], /rel="[^"]*\bnoreferrer\b[^"]*"/, href);
  }
  const work = page.match(/<section id="work-projects"[\s\S]*?<\/section>/);
  assert.ok(work, "Work projects section is missing");
  const workLinks = [...work[0].matchAll(/<a\b([^>]*)>/g)];
  for (const m of workLinks) {
    assert.match(m[1], /target="_blank"/, m[1]);
    assert.match(m[1], /rel="[^"]*\bnoopener\b[^"]*"/, m[1]);
    assert.match(m[1], /rel="[^"]*\bnoreferrer\b[^"]*"/, m[1]);
  }
  const pdf = page.match(/<a class="button" href="assets\/Ram_Career_Overview_Lite\.pdf"([^>]*)>/);
  assert.ok(pdf, "PDF career-overview download is missing");
  assert.match(pdf[1], /target="_blank"/);
  assert.match(pdf[1], /rel="[^"]*\bnoopener\b[^"]*"/);
  const pptx = page.match(/<a class="button button-icon" href="assets\/Ram_Career_Overview\.pptx"([^>]*)>/);
  assert.ok(pptx, "PPTX career-overview download is missing");
  assert.match(pptx[1], /\bdownload\b/);
  assert.match(pptx[1], /target="_blank"/);
  assert.match(pptx[1], /rel="[^"]*\bnoopener\b[^"]*"/);
});

test("every Contact link opens in a new tab with noopener noreferrer", () => {
  const contact = page.match(/<section id="contact"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(contact, "Contact section is missing");
  const links = [...contact[1].matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]);
  assert.ok(links.length >= 5, "Contact should list email, Book a call, GitHub, LinkedIn, and the map link");
  for (const attrs of links) {
    assert.match(attrs, /target="_blank"/, attrs);
    assert.match(attrs, /rel="[^"]*\bnoopener\b[^"]*"/, attrs);
    assert.match(attrs, /rel="[^"]*\bnoreferrer\b[^"]*"/, attrs);
  }
  assert.match(contact[1], /href="mailto:ram\.vellamsetti@gmail\.com"/);
  assert.match(contact[1], /href="https:\/\/github\.com\/ram290476"/);
  assert.match(contact[1], /href="https:\/\/www\.linkedin\.com\/in\/vellamsetti\/"/);
  assert.match(contact[1], /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=San\+Ramon%2C\+CA"/);
  assert.match(contact[1], /href="https:\/\/cal\.com\/ramvellamsetti\/30min"/);
});

test("homepage and preview redirect use the generated photo favicons", () => {
  const files = [
    "assets/favicon.ico",
    "assets/favicon-32.png",
    "assets/apple-touch-icon.png",
    "assets/icon-192.png",
    "assets/icon-512.png"
  ];
  for (const file of files) {
    assert.equal(read(file).length > 0, true, file);
  }
  assert.match(page, /href="assets\/favicon\.ico"/);
  assert.match(page, /href="assets\/favicon-32\.png"/);
  assert.match(page, /rel="apple-touch-icon"[^>]*href="assets\/apple-touch-icon\.png"/);
  assert.match(page, /href="assets\/icon-192\.png"/);
  assert.match(page, /href="assets\/icon-512\.png"/);
  assert.doesNotMatch(page, /favicon\.svg/);
  const preview = read("preview/index.html");
  assert.match(preview, /href="\/assets\/favicon\.ico"/);
  assert.match(preview, /href="\/assets\/apple-touch-icon\.png"/);
  assert.doesNotMatch(preview, /favicon\.svg/);
});

test("left menu uses inline Lucide icons hidden from assistive tech", () => {
  const nav = page.match(/<nav class="nav"[\s\S]*?<\/nav>/);
  assert.ok(nav, "nav is missing");
  const items = [...nav[0].matchAll(/<(a|button)\b[^>]*>[\s\S]*?<\/\1>/g)].map((m) => m[0]);
  assert.equal(items.length, 10, "nav should have nine section links plus Ask Ram");
  const labels = ["About","Skills","Experience","Work projects","Personal projects","Certifications","Training","Education","Contact","Ask Ram"];
  for (const [item, label] of items.map((item, i) => [item, labels[i]])) {
    assert.match(item, new RegExp(`${label}<\\/(a|button)>`));
    assert.match(item, /<svg class="nav-icon"/);
    assert.match(item, /aria-hidden="true"/);
    assert.match(item, /stroke="currentColor"/);
    assert.doesNotMatch(item, /lucide\.com|unpkg|jsdelivr|cdn/);
  }
  const theme = page.match(/<button type="button" class="theme-toggle"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(theme, "theme toggle is missing");
  assert.match(theme[0], /<svg class="nav-icon"/);
  assert.match(theme[0], /aria-hidden="true"/);
  assert.match(theme[0], />Theme<\/button>/);
  assert.match(themes, /\.nav-icon/);
  assert.doesNotMatch(page, /<script[^>]+src="https?:\/\/[^"]*lucide/);
});

test("menu icons have a gap from their labels and are centered as a unit", () => {
  const navRule = themes.match(/\.nav a,\s*\.nav \.chat-launch\s*\{([^}]*)\}/);
  assert.ok(navRule, "nav item rule is missing");
  assert.match(navRule[1], /display:\s*flex/);
  assert.match(navRule[1], /align-items:\s*center/);
  assert.match(navRule[1], /justify-content:\s*center/);
  assert.match(navRule[1], /gap:\s*10px/);
  const themeRule = themes.match(/\.theme-toggle\s*\{([^}]*)\}/);
  assert.ok(themeRule, "theme toggle rule is missing");
  assert.match(themeRule[1], /align-items:\s*center/);
  assert.match(themeRule[1], /justify-content:\s*center/);
  assert.match(themeRule[1], /gap:\s*10px/);
});
