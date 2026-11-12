import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium, webkit, devices } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEMES = ["editorial", "midnight", "minimal", "contrast", "gradient", "glass"];
const BACKGROUND = {
  editorial: "rgb(247, 243, 236)",
  midnight: "rgb(7, 11, 26)",
  minimal: "rgb(13, 17, 23)",
  gradient: "rgb(10, 15, 44)",
  glass: "rgb(11, 16, 38)",
  contrast: "rgb(0, 0, 0)",
};
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

// macOS Safari does not focus a <button> on mousedown, and blurs whatever
// was focused. Playwright's WebKit build does focus buttons, so this shim
// reproduces the Safari press that used to hide the menu before click.
function safariPressShim() {
  document.addEventListener("mousedown", (event) => {
    const target = event.target;
    const button = target && target.closest ? target.closest("button") : null;
    if (!button || document.activeElement === button) return;
    event.preventDefault();
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === "function") active.blur();
  }, true);
}

function launchOptions(name) {
  if (name !== "chromium") return {};
  const opts = { args: ["--no-sandbox"] };
  if (process.env.CHROME) opts.executablePath = process.env.CHROME;
  return opts;
}

async function readTheme(page) {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    stored: localStorage.getItem("ram-portfolio-theme-v1"),
    background: getComputedStyle(document.body).backgroundColor,
  }));
}

async function openNavIfNeeded(page) {
  const toggle = page.locator(".menu-toggle");
  if (!(await toggle.isVisible())) return;
  if ((await toggle.getAttribute("aria-expanded")) === "true") return;
  await toggle.click();
  await page.locator(".sidebar.is-open").waitFor();
}

async function pickWithPointer(page, theme) {
  await openNavIfNeeded(page);
  await page.locator("#theme-toggle").click();
  const option = page.locator(`[data-theme-value="${theme}"]`);
  await option.waitFor({ state: "visible" });
  await option.click({ delay: 120 });
}

async function pickWithKeyboard(page, theme) {
  await openNavIfNeeded(page);
  const toggle = page.locator("#theme-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await page.locator("#theme-menu").waitFor({ state: "visible" });
  await page.keyboard.press("Home");
  for (let i = 0; i < THEMES.indexOf(theme); i += 1) {
    await page.keyboard.press("ArrowDown");
  }
  const active = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-theme-value"));
  assert.equal(active, theme, `keyboard focus landed on ${active}, expected ${theme}`);
  await page.keyboard.press("Enter");
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
  test(`pointer: each theme applies and persists on ${surface.name}`, { timeout: 120_000 }, async () => {
    const browser = await surface.browser.launch(launchOptions(surface.browserName));
    const context = await browser.newContext(surface.context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.addInitScript(safariPressShim);
    try {
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      for (const theme of THEMES) {
        await pickWithPointer(page, theme);
        const applied = await readTheme(page);
        assert.equal(applied.theme, theme, `${surface.name} did not set data-theme to ${theme}`);
        assert.equal(applied.stored, theme, `${surface.name} did not store ${theme}`);
        assert.equal(applied.background, BACKGROUND[theme], `${surface.name} did not paint ${theme}`);
        await page.reload({ waitUntil: "domcontentloaded" });
        const persisted = await readTheme(page);
        assert.equal(persisted.theme, theme, `${surface.name} lost ${theme} after reload`);
        assert.equal(persisted.stored, theme, `${surface.name} lost stored ${theme} after reload`);
        assert.equal(persisted.background, BACKGROUND[theme], `${surface.name} did not restore ${theme} paint`);
      }
      assert.deepEqual(errors, [], errors.join("\n"));
    } finally {
      await browser.close();
    }
  });

  test(`keyboard: each theme applies and persists on ${surface.name}`, { timeout: 120_000 }, async () => {
    const browser = await surface.browser.launch(launchOptions(surface.browserName));
    const context = await browser.newContext(surface.context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    try {
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      for (const theme of THEMES) {
        await pickWithKeyboard(page, theme);
        const applied = await readTheme(page);
        assert.equal(applied.theme, theme, `${surface.name} keyboard did not set ${theme}`);
        assert.equal(applied.stored, theme, `${surface.name} keyboard did not store ${theme}`);
        assert.equal(applied.background, BACKGROUND[theme], `${surface.name} keyboard did not paint ${theme}`);
        await page.reload({ waitUntil: "domcontentloaded" });
        const persisted = await readTheme(page);
        assert.equal(persisted.theme, theme, `${surface.name} keyboard lost ${theme} after reload`);
        assert.equal(persisted.stored, theme);
      }
      assert.deepEqual(errors, [], errors.join("\n"));
    } finally {
      await browser.close();
    }
  });
}
