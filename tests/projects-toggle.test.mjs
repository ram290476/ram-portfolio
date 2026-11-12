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

async function visibleCardCount(page, gridId) {
  return page.locator(`#${gridId} > .card`).evaluateAll((cards) =>
    cards.filter((card) => card.getClientRects().length > 0).length
  );
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

test("project toggles hide extra cards, expand and collapse, and stay keyboard operable", { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "networkidle" });

  const cases = [
    { section: "work-projects", grid: "work-projects-grid", total: 6 },
    { section: "personal-projects", grid: "personal-projects-grid", total: 5 },
  ];

  for (const item of cases) {
    const toggle = page.locator(`#${item.section} .projects-toggle`);
    await assert.equal(await toggle.count(), 1, `${item.section} should have one toggle`);
    await assert.equal(await toggle.isVisible(), true);
    await assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await assert.equal(await toggle.getAttribute("aria-controls"), item.grid);
    await assert.equal((await toggle.textContent()).trim(), "Show more");
    await assert.equal(await visibleCardCount(page, item.grid), 3, `${item.section} should start with three visible projects`);
    await assert.equal(await page.locator(`#${item.grid} > .card`).count(), item.total);

    await toggle.click();
    await assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await assert.equal((await toggle.textContent()).trim(), "Show less");
    await assert.equal(await visibleCardCount(page, item.grid), item.total);

    await toggle.click();
    await assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await assert.equal((await toggle.textContent()).trim(), "Show more");
    await assert.equal(await visibleCardCount(page, item.grid), 3);

    await toggle.focus();
    await page.keyboard.press("Enter");
    await assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await assert.equal(await visibleCardCount(page, item.grid), item.total);

    await page.keyboard.press("Space");
    await assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await assert.equal(await visibleCardCount(page, item.grid), 3);
  }

  // Aside note under Personal projects stays visible while the extra cards are hidden.
  await assert.equal(await page.locator("#personal-projects .aside-note").isVisible(), true);

  await context.close();
});

test("without JavaScript, every project stays visible and the toggle is hidden", { timeout: 30_000 }, async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });

  for (const item of [
    { grid: "work-projects-grid", total: 6 },
    { grid: "personal-projects-grid", total: 5 },
  ]) {
    await assert.equal(await visibleCardCount(page, item.grid), item.total);
  }

  const toggles = page.locator(".projects-toggle");
  await assert.equal(await toggles.count(), 2);
  for (const toggle of await toggles.all()) {
    await assert.equal(await toggle.isVisible(), false);
  }

  await context.close();
});
