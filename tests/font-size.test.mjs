import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium, webkit, devices } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEMES = ["editorial", "midnight", "minimal", "contrast", "gradient", "glass"];
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
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.on("error", reject);
  });
}

function launchOptions(name) {
  if (name !== "chromium") return {};
  const opts = { args: ["--no-sandbox"] };
  if (process.env.CHROME) opts.executablePath = process.env.CHROME;
  return opts;
}

function px(value) {
  return Number.parseFloat(value);
}

async function fontSize(page, selector) {
  return px(await page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontSize));
}

async function scaleOf(page) {
  return page.evaluate(() => ({
    scale: document.documentElement.getAttribute("data-font-scale"),
    stored: localStorage.getItem("font-scale"),
  }));
}

async function openNavIfNeeded(page) {
  const toggle = page.locator(".menu-toggle");
  if (!(await toggle.isVisible())) return;
  if ((await toggle.getAttribute("aria-expanded")) === "true") return;
  await toggle.click();
  await page.locator(".sidebar.is-open").waitFor();
}

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5 && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;
}

async function overflowPx(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

before(async () => {
  await startServer();
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

const SURFACES = [
  { name: "chromium desktop", browser: chromium, browserName: "chromium", context: { viewport: { width: 1280, height: 800 } } },
  { name: "chromium mobile", browser: chromium, browserName: "chromium", context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { name: "webkit desktop", browser: webkit, browserName: "webkit", context: { viewport: { width: 1280, height: 800 } } },
  { name: "webkit iPhone", browser: webkit, browserName: "webkit", context: { ...devices["iPhone 13"] } },
];

for (const surface of SURFACES) {
  test(`A+ and A− change text size and persist on ${surface.name}`, { timeout: 120_000 }, async () => {
    const browser = await surface.browser.launch(launchOptions(surface.browserName));
    const context = await browser.newContext(surface.context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    try {
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      await openNavIfNeeded(page);

      const baseHero = await fontSize(page, ".hero-sub");
      const baseHeading = await fontSize(page, "h1");
      const baseNav = await fontSize(page, ".nav a");
      const baseOverflow = await overflowPx(page);
      assert.ok(Math.abs(baseHero - 16) < 0.6, `${surface.name} default hero is ${baseHero}px`);
      assert.ok(Math.abs(baseNav - 11) < 0.6, `${surface.name} nav text changed at default (${baseNav}px)`);
      assert.equal((await scaleOf(page)).scale, "100");

      const themeBox = await page.locator("#theme-toggle").boundingBox();
      const decBox = await page.locator("#font-decrease").boundingBox();
      const incBox = await page.locator("#font-increase").boundingBox();
      const navBox = await page.locator(".nav").boundingBox();
      const sidebarBox = await page.locator("#sidebar").boundingBox();
      assert.ok(decBox.width >= 24 && decBox.height >= 24, "A− target is under 24px");
      assert.ok(incBox.width >= 24 && incBox.height >= 24, "A+ target is under 24px");
      assert.ok(decBox.x >= themeBox.x + themeBox.width - 1, "A− should sit to the right of Theme");
      assert.ok(incBox.x >= decBox.x + decBox.width - 1, "A+ should sit to the right of A−");
      assert.ok(decBox.y >= navBox.y + navBox.height - 1, "font controls overlap the nav");
      assert.ok(decBox.x >= sidebarBox.x - 1 && incBox.x + incBox.width <= sidebarBox.x + sidebarBox.width + 1, "font controls escape the sidebar");
      assert.equal(overlaps(decBox, themeBox), false);
      assert.equal(overlaps(decBox, navBox), false);
      const menuBox = await page.locator(".menu-toggle").boundingBox();
      assert.equal(overlaps(decBox, menuBox), false, "A− overlaps the menu button");
      if (!surface.name.includes("mobile") && !surface.name.includes("iPhone")) {
        assert.ok(Math.abs(sidebarBox.width - 248) < 1.5, `sidebar width ${sidebarBox.width}`);
      }

      await page.locator("#font-increase").click();
      let state = await scaleOf(page);
      assert.equal(state.scale, "112.5", `${surface.name} A+ did not step to 112.5%`);
      assert.equal(state.stored, "112.5");
      const stepped = await fontSize(page, ".hero-sub");
      assert.ok(Math.abs(stepped - 18) < 0.6, `${surface.name} hero became ${stepped}px`);
      assert.ok(Math.abs(await fontSize(page, ".section-h") - 24.75) < 0.8);
      assert.ok(Math.abs(await fontSize(page, ".nav a") - 11) < 0.6, "nav text scaled");

      await page.reload({ waitUntil: "domcontentloaded" });
      state = await scaleOf(page);
      assert.equal(state.scale, "112.5", `${surface.name} lost the scale after reload`);
      assert.equal(state.stored, "112.5");
      assert.ok(Math.abs(await fontSize(page, ".hero-sub") - 18) < 0.6, `${surface.name} did not restore the size before interaction`);
      assert.ok(Math.abs(await fontSize(page, ".nav a") - 11) < 0.6);

      await openNavIfNeeded(page);
      await page.locator("#font-increase").focus();
      await page.keyboard.press("Enter");
      state = await scaleOf(page);
      assert.equal(state.scale, "125", `${surface.name} keyboard did not increase the size`);
      await page.keyboard.press("ArrowLeft");
      const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
      assert.equal(focused, "font-decrease");
      await page.keyboard.press("Enter");
      assert.equal((await scaleOf(page)).scale, "112.5");

      for (let i = 0; i < 6 && (await scaleOf(page)).scale !== "150"; i += 1) {
        await page.locator("#font-increase").click();
      }
      assert.equal((await scaleOf(page)).scale, "150");
      assert.equal(await page.locator("#font-increase").isDisabled(), true, "A+ should be disabled at 150%");
      assert.equal(await page.locator("#font-decrease").isDisabled(), false);
      const maxHero = await fontSize(page, ".hero-sub");
      const maxHeading = await fontSize(page, "h1");
      assert.ok(Math.abs(maxHero - 24) < 0.6, `max hero ${maxHero}`);
      assert.ok(Math.abs(maxHero / baseHero - 1.5) < 0.03, `hero ratio ${maxHero / baseHero}`);
      assert.ok(Math.abs(maxHeading / baseHeading - 1.5) < 0.05, `heading ${baseHeading} -> ${maxHeading}`);
      assert.ok(Math.abs(await fontSize(page, ".nav a") - 11) < 0.6, "nav scaled at max");
      const maxOverflow = await overflowPx(page);
      assert.ok(maxOverflow <= baseOverflow + 1, `${surface.name} gained horizontal overflow at 150% (${maxOverflow} vs ${baseOverflow})`);

      const navAtMax = await page.locator(".nav").boundingBox();
      const toolsAtMax = await page.locator(".font-size-controls").boundingBox();
      assert.equal(overlaps(navAtMax, toolsAtMax), false, "font controls overlap the nav at 150%");

      for (let i = 0; i < 8 && (await scaleOf(page)).scale !== "87.5"; i += 1) {
        await page.locator("#font-decrease").click();
      }
      assert.equal((await scaleOf(page)).scale, "87.5");
      assert.equal(await page.locator("#font-decrease").isDisabled(), true, "A− should be disabled at 87.5%");
      assert.equal(await page.locator("#font-increase").isDisabled(), false);
      assert.ok(Math.abs(await fontSize(page, ".hero-sub") - 14) < 0.6, `min hero ${(await fontSize(page, ".hero-sub"))}`);
      assert.ok(Math.abs(await fontSize(page, ".nav a") - 11) < 0.6);

      await page.reload({ waitUntil: "domcontentloaded" });
      assert.equal((await scaleOf(page)).scale, "87.5", `${surface.name} lost the minimum after reload`);
      assert.ok(Math.abs(await fontSize(page, ".hero-sub") - 14) < 0.6);
      await openNavIfNeeded(page);
      assert.equal(await page.locator("#font-decrease").isDisabled(), true);

      await page.mouse.move(2, 2);
      for (const theme of THEMES) {
        await page.evaluate((name) => document.documentElement.setAttribute("data-theme", name), theme);
        const colors = await page.evaluate(() => {
          const fontBtn = getComputedStyle(document.getElementById("font-increase"));
          const themeBtn = getComputedStyle(document.querySelector(".theme-toggle"));
          return {
            font: fontBtn.color,
            theme: themeBtn.color,
            fontBorder: fontBtn.borderTopColor,
            themeBorder: themeBtn.borderTopColor,
          };
        });
        assert.equal(colors.font, colors.theme, `${surface.name} ${theme} text color`);
        assert.equal(colors.fontBorder, colors.themeBorder, `${surface.name} ${theme} border`);
      }

      await page.evaluate(() => localStorage.setItem("font-scale", "999"));
      await page.reload({ waitUntil: "domcontentloaded" });
      assert.equal((await scaleOf(page)).scale, "100", "invalid stored scale should fall back to 100%");
      assert.ok(Math.abs(await fontSize(page, ".hero-sub") - 16) < 0.6);
      assert.deepEqual(errors, [], errors.join("\n"));
    } finally {
      await browser.close();
    }
  });

  test(`stored font scale is restored on first load on ${surface.name}`, { timeout: 90_000 }, async () => {
    const browser = await surface.browser.launch(launchOptions(surface.browserName));
    const context = await browser.newContext(surface.context);
    await context.addInitScript(() => localStorage.setItem("font-scale", "150"));
    const page = await context.newPage();
    try {
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      const state = await scaleOf(page);
      assert.equal(state.scale, "150");
      assert.equal(state.stored, "150");
      assert.ok(Math.abs(await fontSize(page, ".hero-sub") - 24) < 0.6, "stored 150% was not applied on load");
      assert.ok(Math.abs(await fontSize(page, ".nav a") - 11) < 0.6);
      await openNavIfNeeded(page);
      assert.equal(await page.locator("#font-increase").isDisabled(), true);
      assert.equal(await page.locator("#font-decrease").isDisabled(), false);
    } finally {
      await browser.close();
    }
  });
}
