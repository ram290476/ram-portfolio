import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrefs,
  THEME_KEY,
  FONT_SCALE_KEY,
  LEGACY_THEME_KEY,
  LEGACY_FONT_SCALE_KEY,
  DEFAULT_THEME,
  DEFAULT_FONT_SCALE,
} from "../prefs.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
  };
}

test("append / save stores a theme and font scale under namespaced keys and nothing else", () => {
  const storage = memoryStorage();
  const prefs = createPrefs({ storage });
  assert.equal(prefs.setTheme("midnight"), true);
  assert.equal(prefs.setFontScale("125"), true);
  assert.equal(storage.getItem(THEME_KEY), "midnight");
  assert.equal(storage.getItem(FONT_SCALE_KEY), "125");
  assert.deepEqual(Object.keys(storage.data).sort(), [FONT_SCALE_KEY, THEME_KEY].sort());
});

test("a later load restores the saved theme and font scale", () => {
  const storage = memoryStorage({ [THEME_KEY]: "glass", [FONT_SCALE_KEY]: "150" });
  const prefs = createPrefs({ storage });
  assert.equal(prefs.theme(), "glass");
  assert.equal(prefs.fontScale(), "150");
});

test("missing values fall back to the defaults", () => {
  const prefs = createPrefs({ storage: memoryStorage() });
  assert.equal(prefs.theme(), DEFAULT_THEME);
  assert.equal(prefs.fontScale(), DEFAULT_FONT_SCALE);
});

test("invalid stored values fall back to the defaults", () => {
  const storage = memoryStorage({ [THEME_KEY]: "not-a-theme", [FONT_SCALE_KEY]: "999" });
  const prefs = createPrefs({ storage });
  assert.equal(prefs.theme(), DEFAULT_THEME);
  assert.equal(prefs.fontScale(), DEFAULT_FONT_SCALE);
  assert.equal(prefs.setTheme("nope"), false);
  assert.equal(prefs.setFontScale("0"), false);
  assert.equal(storage.getItem(THEME_KEY), "not-a-theme");
});

test("legacy un-namespaced keys are restored and copied into the namespaced keys", () => {
  const storage = memoryStorage({ [LEGACY_THEME_KEY]: "minimal", [LEGACY_FONT_SCALE_KEY]: "112.5" });
  const prefs = createPrefs({ storage });
  assert.equal(prefs.theme(), "minimal");
  assert.equal(prefs.fontScale(), "112.5");
  assert.equal(storage.getItem(THEME_KEY), "minimal");
  assert.equal(storage.getItem(FONT_SCALE_KEY), "112.5");
});

test("a namespaced value wins over a conflicting legacy key", () => {
  const storage = memoryStorage({
    [THEME_KEY]: "contrast",
    [LEGACY_THEME_KEY]: "midnight",
    [FONT_SCALE_KEY]: "137.5",
    [LEGACY_FONT_SCALE_KEY]: "87.5",
  });
  const prefs = createPrefs({ storage });
  assert.equal(prefs.theme(), "contrast");
  assert.equal(prefs.fontScale(), "137.5");
});

test("works in memory when localStorage is unavailable", () => {
  const prefs = createPrefs({ storage: null });
  assert.equal(prefs.persistent, false);
  assert.equal(prefs.theme(), DEFAULT_THEME);
  assert.equal(prefs.fontScale(), DEFAULT_FONT_SCALE);
  assert.equal(prefs.setTheme("midnight"), false);
  assert.equal(prefs.setFontScale("125"), false);
});

test("a throwing localStorage is caught and falls back to the defaults", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  const prefs = createPrefs({ storage });
  assert.equal(prefs.theme(), DEFAULT_THEME);
  assert.equal(prefs.fontScale(), DEFAULT_FONT_SCALE);
  assert.equal(prefs.setTheme("midnight"), false);
  assert.equal(prefs.persistent, false);
});

test("stores nothing personal: only a theme id and a font-scale step", () => {
  const storage = memoryStorage();
  const prefs = createPrefs({ storage });
  prefs.setTheme("midnight");
  prefs.setFontScale("125");
  for (const value of Object.values(storage.data)) {
    assert.equal(typeof value, "string");
    assert.doesNotMatch(value, /@|visitor|name|email|phone/i);
  }
});

test("the head boot script and writers use the same namespaced keys, and read them before CSS", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const themeJS = await readFile(new URL("../theme.js", import.meta.url), "utf8");
  const fontJS = await readFile(new URL("../font-size.js", import.meta.url), "utf8");
  const cssAt = page.indexOf('href="styles.css"');
  const themeRead = page.indexOf(`localStorage.getItem("${THEME_KEY}")`);
  const fontRead = page.indexOf(`localStorage.getItem("${FONT_SCALE_KEY}")`);
  assert.ok(themeRead !== -1 && themeRead < cssAt, "theme is restored before the stylesheet");
  assert.ok(fontRead !== -1 && fontRead < cssAt, "font scale is restored before the stylesheet");
  assert.match(themeJS, new RegExp(String.raw`localStorage\.setItem\("${THEME_KEY}"`));
  assert.match(fontJS, new RegExp(String.raw`localStorage\.setItem\("${FONT_SCALE_KEY}"`));
  assert.match(page, new RegExp(String.raw`localStorage\.getItem\("${LEGACY_THEME_KEY}"\)`));
  assert.match(page, new RegExp(String.raw`localStorage\.getItem\("${LEGACY_FONT_SCALE_KEY}"\)`));
});
