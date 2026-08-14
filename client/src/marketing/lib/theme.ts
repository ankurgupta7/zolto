import { useCallback, useEffect, useLayoutEffect, useState } from "react";

/**
 * The marketing surface's theme.
 *
 * "dark" is the site as it has always looked: an oyster-cream page whose
 * argument is carried by full-bleed mahogany bands. "light" keeps the layout,
 * the type and the gold, and swaps those bands for a tone of the paper — see
 * the `[data-theme="light"]` blocks in index.css for the palettes and for
 * why the band needed tokens of its own.
 *
 * Everything here is scoped to the marketing surface on purpose. The theme is
 * expressed as `data-theme` on <html>, and only MarketingShell writes it, so a
 * tenant storefront — whose --brand-* properties are the merchant's own colours,
 * written at runtime by TenantProvider — never sees these overrides.
 */

export const THEMES = ["light", "dark"] as const;
export type MarketingTheme = (typeof THEMES)[number];

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * The light palettes. They differ in one decision — what a statement band
 * becomes once it stops being mahogany — and are offered together while the
 * look is being chosen; expect this list to collapse to the one that is picked.
 */
export const LIGHT_PALETTES = ["parchment", "porcelain", "goldleaf"] as const;
export type LightPalette = (typeof LIGHT_PALETTES)[number];
export const DEFAULT_LIGHT_PALETTE: LightPalette = "parchment";

export const THEME_STORAGE_KEY = "zolto_theme";
export const PALETTE_STORAGE_KEY = "zolto_light_palette";

/**
 * What a first-time visitor gets, before they have touched the toggle.
 *
 * "system", by the site owner's decision — so the surface opens light for a
 * visitor whose OS is in light mode and keeps the mahogany bands for one in
 * dark mode. Worth being clear about the consequence, because resolveTheme
 * spells out which way it falls: `prefers-color-scheme` reports light both when
 * a visitor has chosen light and when they have expressed nothing at all, so
 * *most* first-time visitors now land on the light surface. That is the
 * intended change, not a side effect.
 *
 * Set this to "dark" to pin today's look for everyone and make light mode
 * purely opt-in; nothing else has to change.
 */
export const DEFAULT_PREFERENCE: ThemePreference = "system";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

export function isLightPalette(value: unknown): value is LightPalette {
  return (
    typeof value === "string" &&
    (LIGHT_PALETTES as readonly string[]).includes(value)
  );
}

/**
 * Resolve a stored preference against what the OS is asking for.
 *
 * Note which way "system" falls: `prefers-color-scheme` reports "light" both
 * when the visitor has chosen light *and* when they have expressed nothing at
 * all, so "system" means "light unless the OS says dark" — and "system" is the
 * shipped default, so that is what most first-time visitors get.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): MarketingTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/**
 * What theme to paint, before the OS is consulted.
 *
 * `?theme=light` picks one and sticks, the same way `?light=` picks a palette:
 * it is how a reviewer sees the other theme on a deployed preview without
 * hunting for the switch, and how the screenshot harness drives one. Storage is
 * best-effort — Safari's private mode throws on read as well as on write.
 */
export function readPreference(
  search?: string,
  storage?: Storage,
): ThemePreference {
  const store =
    storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const fromUrl = new URLSearchParams(search ?? "").get("theme");
  if (isThemePreference(fromUrl)) {
    writePreference(fromUrl, store);
    return fromUrl;
  }
  try {
    const stored = store?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function writePreference(
  preference: ThemePreference,
  storage?: Storage,
): void {
  try {
    (storage ?? localStorage)?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode, quota, disabled storage — the in-memory state still holds */
  }
}

/**
 * Which light palette to paint. `?light=porcelain` picks one and sticks — the
 * only way to review three candidate palettes on a deployed preview without
 * three deploys, and the switch the screenshot harness drives.
 */
export function readPalette(search?: string, storage?: Storage): LightPalette {
  const store =
    storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const fromUrl = new URLSearchParams(search ?? "").get("light");
  if (isLightPalette(fromUrl)) {
    if (store) {
      try {
        store.setItem(PALETTE_STORAGE_KEY, fromUrl);
      } catch {
        /* as above */
      }
    }
    return fromUrl;
  }
  try {
    const stored = store?.getItem(PALETTE_STORAGE_KEY);
    return isLightPalette(stored) ? stored : DEFAULT_LIGHT_PALETTE;
  } catch {
    return DEFAULT_LIGHT_PALETTE;
  }
}

/**
 * Write the theme onto <html>.
 *
 * `data-theme` is removed rather than set to "dark" for the dark theme, so the
 * attribute means "this surface has opted into theming at all" — which is what
 * keeps the light overrides (and the `html[data-theme] body` ground) off tenant
 * storefronts sharing the same stylesheet.
 */
export function applyTheme(
  theme: MarketingTheme,
  palette: LightPalette,
  root: HTMLElement,
): void {
  if (theme === "light") {
    root.dataset.theme = "light";
    root.dataset.light = palette;
  } else {
    delete root.dataset.theme;
    delete root.dataset.light;
  }
  // Tells the UA which way to paint form controls, scrollbars and the like.
  // Both themes are light-ground surfaces, so this is "light" either way — the
  // mahogany one is a dark *band* on a cream page, not a dark UI.
  root.style.colorScheme = "light";
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY)?.matches ?? false;
}

export interface MarketingThemeApi {
  /** What the visitor asked for, including "system". */
  preference: ThemePreference;
  /** What that resolves to right now. */
  theme: MarketingTheme;
  palette: LightPalette;
  setPreference: (preference: ThemePreference) => void;
  /** Flip to the other theme, pinning it — the toggle button's action. */
  toggle: () => void;
}

/**
 * Owns the theme for the marketing surface. Mounted once, by MarketingShell.
 *
 * The apply runs in a layout effect so the attribute lands in the same frame
 * React first paints the shell — a paint-then-repaint would flash mahogany
 * bands at a visitor who has chosen light.
 */
export function useMarketingTheme(): MarketingThemeApi {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === "undefined"
      ? DEFAULT_PREFERENCE
      : readPreference(window.location.search),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(() =>
    typeof window === "undefined" ? false : systemPrefersDark(),
  );
  const [palette] = useState<LightPalette>(() =>
    typeof window === "undefined"
      ? DEFAULT_LIGHT_PALETTE
      : readPalette(window.location.search),
  );

  // Follow the OS while the preference is "system". Subscribed unconditionally
  // rather than only for "system": a visitor can switch back to it, and a
  // listener attached late would hold a stale value until the next OS change.
  useEffect(() => {
    const mql = window.matchMedia?.(DARK_QUERY);
    if (!mql?.addEventListener) return;
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(preference, prefersDark);

  useLayoutEffect(() => {
    applyTheme(theme, palette, document.documentElement);
  }, [theme, palette]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writePreference(next);
  }, []);

  const toggle = useCallback(() => {
    setPreferenceState((current) => {
      const next: ThemePreference =
        resolveTheme(current, systemPrefersDark()) === "light"
          ? "dark"
          : "light";
      writePreference(next);
      return next;
    });
  }, []);

  return { preference, theme, palette, setPreference, toggle };
}
