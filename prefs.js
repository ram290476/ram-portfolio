// Theme and font-size preferences, kept only in this browser's localStorage.
// Nothing personal: only a theme id and a font-scale step. No network requests.

export const THEME_KEY = "ram-portfolio-theme-v1";
export const FONT_SCALE_KEY = "ram-portfolio-font-scale-v1";
export const LEGACY_THEME_KEY = "theme";
export const LEGACY_FONT_SCALE_KEY = "font-scale";

export const THEMES = { editorial: 1, midnight: 1, minimal: 1, contrast: 1, gradient: 1, glass: 1 };
export const FONT_SCALES = { "87.5": 1, "100": 1, "112.5": 1, "125": 1, "137.5": 1, "150": 1 };
export const DEFAULT_THEME = "editorial";
export const DEFAULT_FONT_SCALE = "100";

function defaultStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = "__ram-portfolio-prefs-probe__";
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function readKey(storage, persistentRef, key, legacyKey, allowed, fallback) {
  if (!persistentRef.value || !storage) return fallback;
  try {
    const stored = storage.getItem(key);
    if (stored && allowed[stored]) return stored;
    if (legacyKey) {
      const legacy = storage.getItem(legacyKey);
      if (legacy && allowed[legacy]) {
        try { storage.setItem(key, legacy); } catch { persistentRef.value = false; }
        return legacy;
      }
    }
  } catch {
    persistentRef.value = false;
  }
  return fallback;
}

function writeKey(storage, persistentRef, key, value, allowed) {
  if (!allowed[value]) return false;
  if (!persistentRef.value || !storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    persistentRef.value = false;
    return false;
  }
}

export function createPrefs({
  storage = defaultStorage(),
  themes = THEMES,
  fontScales = FONT_SCALES,
} = {}) {
  const persistentRef = { value: Boolean(storage) };

  return {
    get persistent() { return persistentRef.value; },
    theme() {
      return readKey(storage, persistentRef, THEME_KEY, LEGACY_THEME_KEY, themes, DEFAULT_THEME);
    },
    fontScale() {
      return readKey(storage, persistentRef, FONT_SCALE_KEY, LEGACY_FONT_SCALE_KEY, fontScales, DEFAULT_FONT_SCALE);
    },
    setTheme(value) {
      return writeKey(storage, persistentRef, THEME_KEY, value, themes);
    },
    setFontScale(value) {
      return writeKey(storage, persistentRef, FONT_SCALE_KEY, value, fontScales);
    },
  };
}
