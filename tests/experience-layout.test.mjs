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

test("skills heatmap is the default tab, lists top 14 or all skills, and a roles control lists roles", { timeout: 60_000 }, async () => {
  const { context, page, errors } = await openPage();
  assert.equal(await page.locator("#skills-tab-heatmap").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator("#skills-panel-heatmap").getAttribute("hidden"), null);
  assert.equal(await page.locator("#heatmap-grid .hm-skill").count(), 14);
  await page.click("#heatmap-toggle");
  const all = await page.locator("#heatmap-grid .hm-skill").count();
  const unique = await page.evaluate(() => new Set([...document.querySelectorAll("#experience .exp-skill-chips li")].map((li) => li.textContent.trim())).size);
  assert.equal(all, unique);
  await page.click("#heatmap-toggle");
  assert.equal(await page.locator("#heatmap-grid .hm-skill").count(), 14);

  assert.equal((await page.locator("#heatmap-roles").innerText()).trim(), "");
  await page.locator("#heatmap-grid .hm-roles-open").first().click();
  assert.match(await page.locator("#heatmap-roles").innerText(), /\S/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the word cloud still lists every skill from the page", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await page.click("#skills-tab-wordcloud");
  const count = await page.locator("#wordcloud-list li").count();
  const unique = await page.evaluate(() => {
    const counts = new Map();
    document.querySelectorAll("main .pills li, .pills li").forEach((li) => {
      if (li.closest("#wordcloud-list")) return;
      const word = li.textContent.replace(/\s+/g, " ").trim();
      if (!word || word.length > 40) return;
      counts.set(word.toLowerCase(), word);
    });
    return counts.size;
  });
  assert.equal(count, unique);
  assert.equal(count, 138);
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
  await context.close();
});

test("reduced motion turns the Experience and heatmap animations off", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage({ width: 1280, height: 800 }, { reducedMotion: "reduce" });
  const dur = await page.locator("#experience").evaluate((el) => getComputedStyle(el).getPropertyValue("--xp-dur").trim());
  assert.equal(dur, "0ms");
  await page.click("#xp-card-frb");
  const panelTransition = await page.locator("#xp-panel-frb").evaluate((el) => getComputedStyle(el).transitionDuration);
  assert.match(panelTransition, /^0s(, 0s)*$/);
  assert.equal(await page.locator("#skills-panel-heatmap").evaluate((d) => getComputedStyle(d).animationName), "none");
  await context.close();
});

// Reads the heatmap rows in order: skill name, years used, latest year, and the group header above it.
function heatmapRows(page) {
  return page.evaluate(() => {
    const years = [...document.querySelectorAll("#heatmap-grid .hm-yr")].length;
    const rows = [];
    let group = null;
    const kids = [...document.getElementById("heatmap-grid").children];
    kids.forEach((node, i) => {
      if (node.classList.contains("hm-group")) group = node.textContent.trim();
      const skillBtn = node.classList.contains("hm-label") ? node.querySelector(".hm-skill") : null;
      if (!skillBtn) return;
      const cells = kids.slice(i + 1, i + 1 + years);
      const used = cells.map((c, j) => (c.classList.contains("hm-l0") ? -1 : j)).filter((j) => j >= 0);
      rows.push({ skill: skillBtn.dataset.skill, years: used.length, last: used[used.length - 1], group });
    });
    return rows;
  });
}

const pressed = (page) => page.locator(".hm-sort-btn").evaluateAll((els) => els.map((b) => b.dataset.sort + "=" + b.getAttribute("aria-pressed")));

test("heatmap groups and sorts by Most used, By category, A–Z and Most recent, with Show all", { timeout: 60_000 }, async () => {
  const { context, page, errors } = await openPage();
  assert.deepEqual(await pressed(page), ["recent=false", "used=true", "category=false", "az=false"]);
  assert.equal(await page.locator(".hm-sort").getAttribute("role"), "group");

  for (const all of [false, true]) {
    if (all) await page.click("#heatmap-toggle");
    const expected = all ? 63 : 14;

    await page.click('.hm-sort-btn[data-sort="used"]');
    let rows = await heatmapRows(page);
    assert.equal(rows.length, expected);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].years >= rows[i].years, `Most used order at ${rows[i].skill}`);
    assert.equal(await page.locator("#heatmap-grid .hm-group").count(), 0);
    const mostUsed = rows.map((r) => r.skill).sort();

    await page.click('.hm-sort-btn[data-sort="category"]');
    assert.deepEqual(await pressed(page), ["recent=false", "used=false", "category=true", "az=false"]);
    rows = await heatmapRows(page);
    assert.equal(rows.length, expected);
    assert.deepEqual(rows.map((r) => r.skill).sort(), mostUsed, "By category groups the same skills as Most used");
    const siteGroups = await page.locator("#skills .skill-grid h3").evaluateAll((hs) => hs.map((h) => h.textContent.replace(/\s+/g, " ").trim()));
    const allowed = new Set([...siteGroups, "Developer tools", "Integrations"]);
    const headers = await page.locator("#heatmap-grid .hm-group").allInnerTexts();
    assert.ok(headers.length >= 5);
    assert.equal(new Set(headers.map((h) => h.toLowerCase())).size, headers.length, "each group appears once");
    for (const r of rows) assert.ok(allowed.has(r.group), `${r.skill} is in a known group, got ${r.group}`);
    const order = [...allowed];
    for (let i = 1; i < rows.length; i++) assert.ok(order.indexOf(rows[i - 1].group) <= order.indexOf(rows[i].group), "groups follow the Skills section order");
    // A skill listed in the Skills section keeps that section's group.
    assert.equal(rows.find((r) => r.skill === "C#").group, "Languages");
    if (all) assert.equal(rows.find((r) => r.skill === "Docker").group, "Infrastructure & containers");

    await page.click('.hm-sort-btn[data-sort="az"]');
    rows = await heatmapRows(page);
    const names = rows.map((r) => r.skill);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));

    await page.click('.hm-sort-btn[data-sort="recent"]');
    rows = await heatmapRows(page);
    assert.equal(rows.length, expected);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].last >= rows[i].last, `Most recent order at ${rows[i].skill}`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("the grouping control works from the keyboard and is remembered for the session", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await page.focus('.hm-sort-btn[data-sort="used"]');
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.sort), "category");
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.sort), "az");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.sort), "recent");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.sort), "category");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  assert.deepEqual(await pressed(page), ["recent=false", "used=false", "category=false", "az=true"]);
  await page.keyboard.press("Escape");

  await page.reload({ waitUntil: "networkidle" });
  assert.deepEqual(await pressed(page), ["recent=false", "used=false", "category=false", "az=true"]);
  const first = await heatmapRows(page);
  assert.equal(first[0].skill, [...first.map((r) => r.skill)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))[0]);

  // A new session starts on Most used again.
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const other = await fresh.newPage();
  await other.goto(`${base}/`, { waitUntil: "networkidle" });
  assert.deepEqual(await pressed(other), ["recent=false", "used=true", "category=false", "az=false"]);
  await fresh.close();
  await context.close();
});

test("heatmap colors come from each theme with a readable scale, including High contrast", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  const themes = ["editorial", "midnight", "minimal", "contrast", "gradient", "glass"];
  const seen = new Set();
  for (const theme of themes) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.click('.hm-sort-btn[data-sort="category"]');
    const m = await page.evaluate(() => {
      const ctx = document.createElement("canvas").getContext("2d");
      const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = rgb(c); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      const bg = cs("#heatmap-scroll").backgroundColor;
      const l0 = cs("#heatmap-grid .hm-l0").backgroundColor;
      const l1 = cs("#heatmap-grid .hm-l1").backgroundColor;
      const l2 = cs("#heatmap-grid .hm-l2").backgroundColor;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      return {
        l2, accent: rgb(accent).join(","), l2rgb: rgb(l2).join(","),
        legend: cs(".hm-legend .hm-l2").backgroundColor === l2 && cs(".hm-legend .hm-l1").backgroundColor === l1,
        l2l0: ratio(l2, l0), l1l0: ratio(l1, l0), l2l1: ratio(l2, l1),
        group: ratio(cs("#heatmap-grid .hm-group").color, bg), year: ratio(cs("#heatmap-grid .hm-yr").color, bg),
        pressed: ratio(cs('.hm-sort-btn[aria-pressed="true"]').color, cs('.hm-sort-btn[aria-pressed="true"]').backgroundColor),
      };
    });
    assert.equal(m.l2rgb, m.accent, `${theme}: the darkest cell is the theme accent`);
    assert.ok(m.legend, `${theme}: legend swatches match the grid`);
    assert.ok(m.l2l0 >= 3, `${theme}: 2+ roles vs empty ${m.l2l0}`);
    assert.ok(m.l1l0 >= 1.8, `${theme}: 1 role vs empty ${m.l1l0}`);
    assert.ok(m.l2l1 >= 2.5, `${theme}: 2+ roles vs 1 role ${m.l2l1}`);
    assert.ok(m.group >= 4.5 && m.year >= 4.5, `${theme}: header text contrast ${m.group}/${m.year}`);
    assert.ok(m.pressed >= 4.5, `${theme}: selected grouping button contrast ${m.pressed}`);
    seen.add(m.l2);
  }
  assert.equal(seen.size, themes.length, "every theme has its own heatmap color");
  await context.close();
});

test("at 375px the grouping control fits and skill labels stay visible while the grid scrolls", { timeout: 60_000 }, async () => {
  const { context, page } = await openPage({ width: 375, height: 812 });
  const box = await page.locator(".hm-sort").boundingBox();
  for (const b of await page.locator(".hm-sort-btn").all()) {
    const r = await b.boundingBox();
    assert.ok(r.x >= box.x - 1 && r.x + r.width <= box.x + box.width + 1 && r.y + r.height <= box.y + box.height + 1, "button inside the control");
    assert.ok(r.height >= 24, "target size");
  }
  // The grid opens on the latest years, and the skill label column stays pinned.
  assert.ok(await page.locator("#heatmap-scroll").evaluate((el) => el.scrollLeft > 0));
  const label = await page.locator("#heatmap-grid .hm-skill").first().boundingBox();
  const scroller = await page.locator("#heatmap-scroll").boundingBox();
  assert.ok(label.x >= scroller.x && label.x < scroller.x + 20, "label pinned to the left edge");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
  await context.close();
});

test("the grouping control is right-aligned on desktop and full-width on a phone", { timeout: 60_000 }, async () => {
  const themes = ["editorial", "midnight", "minimal", "contrast", "gradient", "glass"];
  const { context, page } = await openPage({ width: 1280, height: 800 });
  for (const theme of themes) {
    await page.evaluate((th) => document.documentElement.setAttribute("data-theme", th), theme);
    const sort = await page.locator(".hm-sort").boundingBox();
    const grid = await page.locator("#heatmap-scroll").boundingBox();
    assert.ok(Math.abs((sort.x + sort.width) - (grid.x + grid.width)) <= 2, `${theme}: sort bar right edge lines up with the grid`);
    assert.ok(sort.x > grid.x + 40, `${theme}: sort bar is on the right, not the left`);
  }
  await context.close();

  const phone = await openPage({ width: 375, height: 812 });
  const sort = await phone.page.locator(".hm-sort").boundingBox();
  const grid = await phone.page.locator("#heatmap-scroll").boundingBox();
  assert.ok(Math.abs(sort.x - grid.x) <= 2, "on a phone the 2×2 control stays full-width on the left");
  assert.ok(Math.abs((sort.x + sort.width) - (grid.x + grid.width)) <= 2, "on a phone the 2×2 control stays full-width on the right");
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
  await phone.context.close();
});
