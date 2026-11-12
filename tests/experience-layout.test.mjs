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

const expanded = (page, sel) => page.locator(sel).getAttribute("aria-expanded");
const openPanels = (page, sel) => page.locator(sel).evaluateAll((els) => els.filter((el) => el.classList.contains("is-open")).map((el) => el.id));

test("company cards open one company at a time and roles open one role at a time", { timeout: 60_000 }, async () => {
  const { context, page, errors } = await openPage();
  assert.equal(await page.locator("#experience .xp-card").count(), 4);
  assert.deepEqual(await openPanels(page, "#experience .xp-cos ~ .xp-panel"), []);
  // Closed panels are not in the tab order.
  assert.equal(await page.locator("#role-jpmc-sre").isVisible(), false);

  await page.click("#xp-card-jpmc");
  assert.equal(await expanded(page, "#xp-card-jpmc"), "true");
  assert.deepEqual(await openPanels(page, "#experience .xp-cos ~ .xp-panel"), ["xp-panel-jpmc"]);
  await page.locator("#role-jpmc-sre").waitFor({ state: "visible" });
  assert.equal(await page.locator("#xp-panel-jpmc .exp-role-block").count(), 2);

  await page.click("#role-jpmc-sre");
  assert.equal(await expanded(page, "#role-jpmc-sre"), "true");
  await page.locator("#resp-jpmc-sre .exp-resp-list li").first().waitFor({ state: "visible" });
  await page.click("#role-jpmc-mlops");
  assert.equal(await expanded(page, "#role-jpmc-sre"), "false");
  assert.equal(await expanded(page, "#role-jpmc-mlops"), "true");

  // Opening another company closes the first one and its roles.
  await page.click("#xp-card-esp");
  assert.equal(await expanded(page, "#xp-card-jpmc"), "false");
  assert.equal(await expanded(page, "#role-jpmc-mlops"), "false");
  assert.deepEqual(await openPanels(page, "#experience .xp-panel"), ["xp-panel-esp"]);

  // Clicking the open card again collapses it.
  await page.click("#xp-card-esp");
  assert.equal(await expanded(page, "#xp-card-esp"), "false");
  assert.deepEqual(await openPanels(page, "#experience .xp-panel"), []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("company cards and roles work from the keyboard", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await page.focus("#xp-card-jpmc");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.id), "xp-card-frb");
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => document.activeElement.id), "xp-card-esp");
  await page.keyboard.press("Home");
  assert.equal(await page.evaluate(() => document.activeElement.id), "xp-card-jpmc");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement.id), "xp-card-esp");
  await page.keyboard.press("Enter");
  assert.equal(await expanded(page, "#xp-card-esp"), "true");
  await page.locator("#role-esp").waitFor({ state: "visible" });
  await page.focus("#role-esp");
  await page.keyboard.press("Space");
  assert.equal(await expanded(page, "#role-esp"), "true");
  await context.close();
});

test("without JavaScript every company, role and responsibility is visible", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage({ width: 1280, height: 800 }, { javaScriptEnabled: false });
  for (const id of ["jpmc-sre", "jpmc-mlops", "frb", "corsair-net", "corsair-commerce", "esp"]) {
    assert.equal(await page.locator(`#resp-${id} .exp-resp-list li`).first().isVisible(), true, id);
  }
  await context.close();
});

test("skills heatmap opens left of the word cloud, lists top 14 or all skills, traps and returns focus", { timeout: 60_000 }, async () => {
  const { context, page, errors } = await openPage();
  const heat = await page.locator("#heatmap-open").boundingBox();
  const cloud = await page.locator("#wordcloud-open").boundingBox();
  assert.ok(heat.x + heat.width <= cloud.x, "heatmap icon sits left of the word-cloud icon");
  assert.ok(Math.abs(heat.y - cloud.y) < 2, "icons share a row");

  await page.click("#heatmap-open");
  assert.equal(await page.locator("#heatmap-dialog").evaluate((d) => d.open), true);
  assert.equal(await expanded(page, "#heatmap-open"), "true");
  assert.equal(await page.locator("#heatmap-grid .hm-skill").count(), 14);
  await page.click("#heatmap-toggle");
  const all = await page.locator("#heatmap-grid .hm-skill").count();
  const unique = await page.evaluate(() => new Set([...document.querySelectorAll("#experience .exp-skill-chips li")].map((li) => li.textContent.trim())).size);
  assert.equal(all, unique);
  await page.click("#heatmap-toggle");
  assert.equal(await page.locator("#heatmap-grid .hm-skill").count(), 14);

  await page.locator("#heatmap-grid .hm-skill").first().click();
  assert.match(await page.locator("#heatmap-roles").innerText(), /\S/);

  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.getElementById("heatmap-dialog").contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  // The dialog's close event fires in a later task, so wait for its handler.
  await page.waitForFunction(() => document.getElementById("heatmap-open").getAttribute("aria-expanded") === "false");
  assert.equal(await page.locator("#heatmap-dialog").evaluate((d) => d.open), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "heatmap-open");
  assert.deepEqual(errors, []);
  await context.close();
});

test("the word cloud still opens with every skill from the page", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await page.click("#wordcloud-open");
  assert.equal(await page.locator("#wordcloud-dialog").evaluate((d) => d.open), true);
  assert.ok(await page.locator("#wordcloud-list li").count() > 100);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("wordcloud-dialog").open);
  assert.equal(await page.evaluate(() => document.activeElement.id), "wordcloud-open");
  await context.close();
});

test("at 375px the cards scroll inside their row and the page never scrolls sideways", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage({ width: 375, height: 812 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.equal(await overflow(), 0);
  await page.locator("#xp-card-corsair").scrollIntoViewIfNeeded();
  await page.click("#xp-card-corsair");
  await page.locator("#role-corsair-commerce").waitFor({ state: "visible" });
  await page.click("#role-corsair-commerce");
  await page.waitForTimeout(500);
  assert.equal(await overflow(), 0);
  await page.click("#heatmap-open");
  assert.equal(await overflow(), 0);
  await context.close();
});

test("reduced motion turns the Experience and heatmap animations off", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage({ width: 1280, height: 800 }, { reducedMotion: "reduce" });
  const dur = await page.locator("#experience").evaluate((el) => getComputedStyle(el).getPropertyValue("--xp-dur").trim());
  assert.equal(dur, "0ms");
  await page.click("#xp-card-frb");
  const panelTransition = await page.locator("#xp-panel-frb").evaluate((el) => getComputedStyle(el).transitionDuration);
  assert.match(panelTransition, /^0s(, 0s)*$/);
  await page.click("#heatmap-open");
  assert.equal(await page.locator("#heatmap-dialog").evaluate((d) => getComputedStyle(d).animationName), "none");
  await context.close();
});
