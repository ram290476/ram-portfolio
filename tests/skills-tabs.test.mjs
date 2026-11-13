import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

let server;
let base;
let browser;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
      if (rel.endsWith("/")) rel += "index.html";
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) {
        res.writeHead(403); res.end(); return;
      }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
    server.on("error", reject);
  });
}

before(async () => {
  await startServer();
  const launch = { args: ["--no-sandbox"] };
  if (process.env.CHROME) launch.executablePath = process.env.CHROME;
  browser = await chromium.launch(launch);
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openPage(viewport = { width: 1280, height: 800 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function selectedTab(page) {
  return page.locator('#skills [role="tab"][aria-selected="true"]').getAttribute("id");
}

async function visiblePanels(page) {
  return page.evaluate(() => [...document.querySelectorAll("#skills [role='tabpanel']")].filter((el) => !el.hidden).map((el) => el.id));
}

async function visitorCount(page) {
  return page.locator(".chat-message--visitor").count();
}

async function assertAutoSend(page, skill, sentBefore) {
  const expected = `What is his experience with ${skill}?`;
  assert.equal(await page.locator("#portfolio-chat-panel").evaluate((d) => d.open), true);
  await page.waitForFunction((n) => document.querySelectorAll(".chat-message--visitor").length === n, sentBefore + 1);
  assert.equal(await visitorCount(page), sentBefore + 1, "the question must be sent exactly once");
  assert.equal((await page.locator(".chat-message--visitor p").last().innerText()).trim(), expected);
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll("#portfolio-chat-panel .chat-message")];
    const lastVisitor = msgs.findLastIndex((m) => m.classList.contains("chat-message--visitor"));
    return lastVisitor >= 0 && msgs.slice(lastVisitor + 1).some((m) => m.classList.contains("chat-message--guide"));
  });
  assert.equal(await page.locator("#portfolio-chat-input").inputValue(), "");
}

async function closeChat(page) {
  if (await page.locator("#portfolio-chat-panel").evaluate((d) => d.open)) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("portfolio-chat-panel").open);
  }
}

test("Heatmap is the default Skills tab; Category and Word cloud switch in and hide the others", { timeout: 60_000 }, async () => {
  const { context, page, errors } = await openPage();
  assert.equal(await selectedTab(page), "skills-tab-heatmap");
  assert.deepEqual(await visiblePanels(page), ["skills-panel-heatmap"]);
  assert.equal(await page.locator("#skills-tab-heatmap").getAttribute("tabindex"), "0");
  assert.equal(await page.locator("#skills-tab-category").getAttribute("tabindex"), "-1");
  assert.equal(await page.locator("#skills-tab-wordcloud").getAttribute("tabindex"), "-1");
  assert.equal(await page.locator("#heatmap-grid .hm-skill").count(), 14);
  assert.equal(await page.locator("#skills-panel-category .skill-grid").isVisible(), false);
  assert.equal(await page.locator("#wordcloud-list").isVisible(), false);

  await page.click("#skills-tab-category");
  assert.equal(await selectedTab(page), "skills-tab-category");
  assert.deepEqual(await visiblePanels(page), ["skills-panel-category"]);
  assert.equal(await page.locator("#skills-panel-category .skill-grid").isVisible(), true);
  assert.equal(await page.locator("#skills-panel-heatmap").isVisible(), false);
  assert.ok(await page.locator("#skills-panel-category .skill-grid article").count() >= 9);

  await page.click("#skills-tab-wordcloud");
  assert.equal(await selectedTab(page), "skills-tab-wordcloud");
  assert.deepEqual(await visiblePanels(page), ["skills-panel-wordcloud"]);
  assert.equal(await page.locator("#wordcloud-list").isVisible(), true);
  assert.equal(await page.locator("#wordcloud-list li").count(), 138);
  assert.deepEqual(errors, []);
  await context.close();
});

test("Skills tabs use a roving tabindex and Arrow, Home and End keys", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await page.focus("#skills-tab-heatmap");
  await page.keyboard.press("ArrowRight");
  assert.equal(await selectedTab(page), "skills-tab-category");
  assert.equal(await page.evaluate(() => document.activeElement.id), "skills-tab-category");
  assert.equal(await page.locator("#skills-tab-category").getAttribute("tabindex"), "0");
  assert.equal(await page.locator("#skills-tab-heatmap").getAttribute("tabindex"), "-1");
  await page.keyboard.press("End");
  assert.equal(await selectedTab(page), "skills-tab-wordcloud");
  await page.keyboard.press("ArrowRight");
  assert.equal(await selectedTab(page), "skills-tab-heatmap");
  await page.keyboard.press("Home");
  assert.equal(await selectedTab(page), "skills-tab-heatmap");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await selectedTab(page), "skills-tab-wordcloud");
  await context.close();
});

test("without JavaScript the Category cards stay visible", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage({ width: 1280, height: 800 }, { javaScriptEnabled: false });
  assert.equal(await page.locator("#skills-panel-category .skill-grid article").first().isVisible(), true);
  assert.equal(await page.locator("#skills-tab-heatmap").isVisible(), false);
  assert.equal(await page.locator("#heatmap-grid .hm-skill").count(), 0);
  await context.close();
});

test("clicking a skill in each Skills tab opens Ask Ram and sends the question once", { timeout: 60_000 }, async () => {
  const { context, page, errors } = await openPage();

  // Heatmap: the skill name opens Ask Ram and sends; it does not list roles.
  const heatSkill = await page.locator("#heatmap-grid .hm-skill").first().innerText();
  const heatBtn = page.locator("#heatmap-grid .hm-skill").first();
  const heatBefore = await visitorCount(page);
  await heatBtn.evaluate((el) => { el.click(); el.click(); });
  await assertAutoSend(page, heatSkill, heatBefore);
  assert.equal((await page.locator("#heatmap-roles").innerText()).trim(), "");
  await closeChat(page);

  // The roles control (and year cells) still list roles, without opening Ask Ram.
  await page.locator("#heatmap-grid .hm-roles-open").first().click();
  assert.ok((await page.locator("#heatmap-roles").innerText()).includes(heatSkill));
  assert.equal(await page.locator("#portfolio-chat-panel").evaluate((d) => d.open), false);
  await page.locator("#heatmap-grid .hm-roles-open").first().click();
  assert.equal((await page.locator("#heatmap-roles").innerText()).trim(), "");
  const cell = page.locator("#heatmap-grid .hm-cell[data-skill]").first();
  const cellSkill = await cell.getAttribute("data-skill");
  await cell.click();
  assert.ok((await page.locator("#heatmap-roles").innerText()).includes(cellSkill));
  assert.equal(await page.locator("#portfolio-chat-panel").evaluate((d) => d.open), false);

  await page.click("#skills-tab-category");
  const terraform = page.locator('#skills-panel-category .skill-ask[aria-label="Ask Ram about Terraform"]');
  const catBefore = await visitorCount(page);
  await terraform.evaluate((el) => { el.click(); el.click(); });
  await assertAutoSend(page, "Terraform", catBefore);
  await closeChat(page);

  await page.click("#skills-tab-wordcloud");
  const cloud = page.locator('#wordcloud-list .skill-ask[aria-label="Ask Ram about Terraform"]');
  assert.equal(await cloud.count(), 1);
  const cloudBefore = await visitorCount(page);
  await cloud.evaluate((el) => { el.click(); el.click(); });
  await assertAutoSend(page, "Terraform", cloudBefore);
  assert.deepEqual(errors, []);
  await context.close();
});

test("word cloud input stays 138 words with the same sizes after making words buttons", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await page.click("#skills-tab-wordcloud");
  const info = await page.evaluate(() => {
    const counts = new Map();
    document.querySelectorAll("main .pills li, .pills li").forEach((li) => {
      if (li.closest("#wordcloud-list")) return;
      const word = li.textContent.replace(/\s+/g, " ").trim();
      if (!word || word.length > 40) return;
      const key = word.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.n += 1; else counts.set(key, { word, n: 1 });
    });
    const words = [...counts.values()];
    const max = Math.max(...words.map((w) => w.n));
    const hash = (str) => {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    };
    words.sort((a, b) => hash(a.word) - hash(b.word));
    const expected = words.map((w) => {
      const t = max > 1 ? (w.n - 1) / (max - 1) : 0;
      return {
        word: w.word,
        fontSize: ((13 + Math.round(Math.sqrt(t) * 25)) / 16) + "rem",
        tier: "wc-t" + (t >= 0.6 ? 3 : t >= 0.3 ? 2 : t > 0 ? 1 : 0)
      };
    });
    const actual = [...document.querySelectorAll("#wordcloud-list li")].map((li) => ({
      word: li.textContent.trim(),
      fontSize: li.style.fontSize,
      tier: [...li.classList].find((c) => c.startsWith("wc-t")),
      isButton: li.querySelector("button.skill-ask") != null
    }));
    return { expected, actual };
  });
  assert.equal(info.actual.length, 138);
  assert.equal(info.expected.length, 138);
  assert.deepEqual(
    info.actual.map(({ word, fontSize, tier }) => ({ word, fontSize, tier })),
    info.expected
  );
  assert.ok(info.actual.every((item) => item.isButton));
  await context.close();
});

test("reduced motion turns off the Skills tab panel animation", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage({ width: 1280, height: 800 }, { reducedMotion: "reduce" });
  assert.equal(await page.locator("#skills-panel-heatmap").evaluate((el) => getComputedStyle(el).animationName), "none");
  await page.click("#skills-tab-category");
  assert.equal(await page.locator("#skills-panel-category").evaluate((el) => getComputedStyle(el).animationName), "none");
  await context.close();
});
