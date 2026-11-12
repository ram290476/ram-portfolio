import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const THEMES = ["editorial", "midnight", "minimal", "contrast", "gradient", "glass"];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];
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

async function runAxe(page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  }));
}

function formatViolations(label, results) {
  if (!results.violations.length) return "";
  return results.violations.map((v) => {
    const nodes = v.nodes.map((n) => `    ${n.target.join(" ")}`).join("\n");
    return `${label}: [${v.impact}] ${v.id} — ${v.help}\n${nodes}`;
  }).join("\n");
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
  }, theme);
}

async function openMobileMenu(page, viewport) {
  if (viewport !== "mobile") return;
  await page.evaluate(() => {
    const sidebar = document.getElementById("sidebar");
    const toggle = document.querySelector(".menu-toggle");
    if (sidebar) sidebar.classList.add("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
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

test("axe: homepage in every theme at desktop and mobile", { timeout: 180_000 }, async () => {
  const failures = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    for (const theme of THEMES) {
      await page.goto(`${base}/`, { waitUntil: "networkidle" });
      await setTheme(page, theme);
      await openMobileMenu(page, vp.name);
      const results = await runAxe(page);
      const msg = formatViolations(`${vp.name}/${theme}/page`, results);
      if (msg) failures.push(msg);
    }
    await context.close();
  }
  assert.equal(failures.join("\n"), "", failures.join("\n"));
});

test("axe: theme menu, word cloud, skills heatmap, chat, and slides dialogs", { timeout: 120_000 }, async () => {
  const failures = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await openMobileMenu(page, vp.name);

    await page.evaluate(() => document.getElementById("theme-toggle").click());
    await page.waitForTimeout(100);
    let results = await runAxe(page);
    let msg = formatViolations(`${vp.name}/theme-menu`, results);
    if (msg) failures.push(msg);
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const btn = document.getElementById("wordcloud-open");
      if (btn) { btn.hidden = false; btn.click(); }
    });
    await page.waitForTimeout(200);
    results = await runAxe(page);
    msg = formatViolations(`${vp.name}/wordcloud`, results);
    if (msg) failures.push(msg);
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const btn = document.getElementById("heatmap-open");
      if (btn) { btn.hidden = false; btn.click(); }
    });
    await page.waitForTimeout(350);
    results = await runAxe(page);
    msg = formatViolations(`${vp.name}/heatmap`, results);
    if (msg) failures.push(msg);
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const btn = document.querySelector("[data-chat-open]");
      if (btn) { btn.hidden = false; btn.click(); }
    });
    await page.waitForTimeout(200);
    results = await runAxe(page);
    msg = formatViolations(`${vp.name}/chat`, results);
    if (msg) failures.push(msg);
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const btn = document.querySelector("[data-slides-open]");
      if (btn) { btn.hidden = false; btn.click(); }
    });
    await page.waitForTimeout(250);
    results = await runAxe(page);
    msg = formatViolations(`${vp.name}/slides`, results);
    if (msg) failures.push(msg);
    await page.keyboard.press("Escape");

    await context.close();
  }
  assert.equal(failures.join("\n"), "", failures.join("\n"));
});

test("axe: Experience with a company and a role expanded, in every theme", { timeout: 180_000 }, async () => {
  const failures = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const theme of THEMES) {
      await page.goto(`${base}/`, { waitUntil: "networkidle" });
      await setTheme(page, theme);
      await openMobileMenu(page, vp.name);
      await page.evaluate(() => {
        document.getElementById("xp-card-corsair").click();
        document.getElementById("role-corsair-commerce").click();
      });
      await page.waitForTimeout(100);
      const results = await runAxe(page);
      const msg = formatViolations(`${vp.name}/${theme}/experience-expanded`, results);
      if (msg) failures.push(msg);
    }
    await context.close();
  }
  assert.equal(failures.join("\n"), "", failures.join("\n"));
});

test("axe: preview redirect page", { timeout: 30_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const raw = window.location.replace.bind(window.location);
    window.location.replace = () => {};
    void raw;
  });
  await page.goto(`${base}/preview/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.querySelectorAll('meta[http-equiv="refresh"]').forEach((m) => m.remove());
  });
  const results = await runAxe(page);
  await context.close();
  const msg = formatViolations("preview", results);
  assert.equal(msg, "", msg);
});
