import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_LIGHT_PALETTE,
  DEFAULT_PREFERENCE,
  LIGHT_PALETTES,
  PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  isLightPalette,
  isThemePreference,
  readPalette,
  readPreference,
  resolveTheme,
  writePreference,
} from "./theme";

/** A localStorage that throws on every operation — Safari's private mode. */
function hostileStorage(): Storage {
  const boom = () => {
    throw new DOMException("QuotaExceededError");
  };
  return {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
    length: 0,
  } as unknown as Storage;
}

describe("resolveTheme", () => {
  it("takes an explicit preference over what the OS asks for", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  /**
   * `prefers-color-scheme` reports light both when the visitor chose light and
   * when they expressed nothing at all, so "system" is "light unless told
   * otherwise" — and "system" is the shipped default, which is what makes the
   * light surface the one most first-time visitors see.
   */
  it("follows the OS only when the preference is 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("preference storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a written preference", () => {
    writePreference("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(readPreference()).toBe("light");
  });

  it("falls back to the default when nothing is stored", () => {
    expect(readPreference()).toBe(DEFAULT_PREFERENCE);
  });

  // Symmetric with ?light=: the way to see the other theme on a deployed
  // preview, and how the screenshot harness drives one.
  it("takes ?theme= and remembers it", () => {
    expect(readPreference("?theme=light")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(readPreference()).toBe("light");
  });

  it("ignores an unknown theme in the URL", () => {
    expect(readPreference("?theme=sepia")).toBe(DEFAULT_PREFERENCE);
  });

  it("ignores a stored value that is not a preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readPreference()).toBe(DEFAULT_PREFERENCE);
  });

  // Storage is best-effort: a browser that refuses it must still render a
  // themed page rather than throwing out of the shell's first render.
  it("survives storage that throws on read and on write", () => {
    const storage = hostileStorage();
    expect(readPreference("", storage)).toBe(DEFAULT_PREFERENCE);
    expect(() => writePreference("light", storage)).not.toThrow();
  });
});

describe("readPalette", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to parchment", () => {
    expect(readPalette("")).toBe(DEFAULT_LIGHT_PALETTE);
  });

  it("takes ?light= and remembers it, so the next page keeps the palette", () => {
    expect(readPalette("?light=goldleaf")).toBe("goldleaf");
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("goldleaf");
    expect(readPalette("")).toBe("goldleaf");
  });

  it("ignores an unknown palette in the URL rather than painting nothing", () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, "porcelain");
    expect(readPalette("?light=neon")).toBe("porcelain");
  });
});

describe("guards", () => {
  it("accept exactly the known values", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("Light")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    for (const palette of LIGHT_PALETTES) {
      expect(isLightPalette(palette)).toBe(true);
    }
    expect(isLightPalette("sepia")).toBe(false);
  });
});

describe("applyTheme", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement("html");
  });

  it("writes the theme and the palette for light", () => {
    applyTheme("light", "goldleaf", root);
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(root.getAttribute("data-light")).toBe("goldleaf");
  });

  /**
   * The dark theme is the *absence* of the attribute, not `data-theme="dark"`.
   * The light overrides and the `html[data-theme] body` ground both key off it,
   * and tenant storefronts share this stylesheet — so a stray attribute would
   * repaint a merchant's own colours.
   */
  it("removes the attributes for dark rather than setting data-theme='dark'", () => {
    applyTheme("light", "parchment", root);
    applyTheme("dark", "parchment", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(root.hasAttribute("data-light")).toBe(false);
  });

  // Both themes are a light *ground* — the mahogany one is a dark band on cream,
  // not a dark UI — so UA-painted chrome should never flip to dark.
  it("keeps color-scheme light in both themes", () => {
    applyTheme("dark", "parchment", root);
    expect(root.style.colorScheme).toBe("light");
    applyTheme("light", "parchment", root);
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("the shipped default", () => {
  /**
   * Guards the site's default appearance, which is a product decision rather
   * than an implementation detail. Change this test in the same commit that
   * changes the default, deliberately.
   */
  it("follows the operating system", () => {
    expect(DEFAULT_PREFERENCE).toBe("system");
  });

  /**
   * The consequence, stated rather than left to be discovered: a visitor who
   * has expressed no OS preference reports light, so the light surface is what
   * most first-time visitors see. Pinning DEFAULT_PREFERENCE to "dark" is the
   * one-line way back.
   */
  it("means a visitor with no OS preference lands on the light surface", () => {
    expect(resolveTheme(DEFAULT_PREFERENCE, false)).toBe("light");
    expect(resolveTheme(DEFAULT_PREFERENCE, true)).toBe("dark");
  });
});

afterEach(() => vi.restoreAllMocks());
