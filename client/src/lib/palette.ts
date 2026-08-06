/**
 * Storefront palette derivation.
 *
 * A tenant stores two brand colors: `primary_color` (the structural dark — hero,
 * footer, primary buttons) and the optional `secondary_color` (the highlight —
 * dividers, eyebrow labels, hover states). From those we derive the whole *dark*
 * half of the storefront palette. The warm-neutral *surfaces* (cream grounds and
 * borders) are not derived here at all; they come from the store's template
 * (shared/templates.ts), so the two compose instead of fighting.
 *
 * Why two and not one: an accent spun out of the primary's own hue can only ever
 * be a lighter tint of it, which cannot express the ordinary small-shop identity
 * of one structural color plus an unrelated highlight — Kalakosh's espresso ink
 * and gold being the case in this very repo (KALAKOSH_BRANDING has to hardcode
 * the gold because a one-color derivation cannot reach it). Passing a secondary
 * moves the accent family onto that hue.
 *
 * Why not three: the next colors a storefront needs are semantic — success,
 * error, low-stock — and those must stay fixed platform-wide, or a merchant
 * whose brand is green ends up with a "sold out" badge that reads as "in stock".
 *
 * Omitting `secondaryColor` reproduces the original single-color behaviour
 * exactly, so stores that predate the second color keep their look.
 *
 * Everything here is pure and framework-free so it can be unit-tested and reused;
 * `TenantContext` is the only place that writes the result to the document.
 */

export interface Hsl {
  /** hue in degrees, 0–360 */
  h: number;
  /** saturation, 0–1 */
  s: number;
  /** lightness, 0–1 */
  l: number;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/** Parse a `#rrggbb` (or `#rgb`) string into HSL. Returns null if not a hex color. */
export function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let body = m[1];
  if (body.length === 3) {
    body = body
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(body.slice(0, 2), 16) / 255;
  const g = parseInt(body.slice(2, 4), 16) / 255;
  const b = parseInt(body.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return { h, s, l };
}

/** Serialize HSL back to `#rrggbb`. h wraps, s/l are clamped to [0,1]. */
export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const lum = clamp(l, 0, 1);

  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lum - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** The subset of `--brand-*` custom properties we drive from `primary_color`. */
export interface BrandPalette {
  "--brand-ink": string;
  "--brand-ink-hover": string;
  "--brand-ink-deep": string;
  "--brand-text": string;
  "--brand-accent": string;
  "--brand-accent-light": string;
}

/**
 * Derive the ink family + accent from the store's brand colors.
 *
 * `primaryColor` is treated as the dominant dark (`--brand-ink`). Hover/deep are
 * small lightness steps around it; text is a near-black of the same hue.
 *
 * `secondaryColor`, when supplied and parseable, becomes the accent family — its
 * own hue and saturation, with only its lightness anchored into a band that stays
 * legible against both the ink and the cream surfaces. That anchoring is why the
 * merchant's swatch and the rendered accent can differ slightly: a secondary
 * picked near-black would otherwise vanish against the footer.
 *
 * With no secondary, the accent falls back to the original behaviour — a lighter,
 * more saturated tint of the primary's hue (a navy brand yields a mid-blue accent,
 * not gold) — so existing single-color stores render identically.
 *
 * Surfaces/borders are deliberately not returned; they come from the template.
 *
 * Returns null for an unparseable primary so callers can fall back to CSS defaults.
 * An unparseable *secondary* is ignored rather than fatal — a half-typed hex in the
 * signup form must not blank the whole preview.
 */
export function derivePalette(
  primaryColor: string,
  secondaryColor?: string | null,
): BrandPalette | null {
  const hsl = hexToHsl(primaryColor);
  if (!hsl) return null;

  const { h, s } = hsl;
  // Anchor the ink lightness into a sensible "dominant dark" band even if the tenant
  // supplied something a bit light or nearly black, so the derived family stays legible.
  const inkL = clamp(hsl.l, 0.14, 0.34);
  const inkS = clamp(s, 0.08, 0.9);

  const accentHsl = secondaryColor ? hexToHsl(secondaryColor) : null;
  // Two branches rather than one parameterised formula, so the no-secondary case
  // is bit-identical to what shipped before the second color existed.
  const accent = accentHsl
    ? {
        h: accentHsl.h,
        s: clamp(accentHsl.s, 0.25, 0.95),
        l: clamp(accentHsl.l, 0.42, 0.62),
      }
    : { h, s: clamp(inkS + 0.12, 0.35, 0.95), l: 0.52 };
  const accentLight = accentHsl
    ? { h: accent.h, s: accent.s, l: clamp(accent.l + 0.12, 0, 0.8) }
    : { h, s: clamp(inkS + 0.1, 0.3, 0.95), l: 0.64 };

  return {
    "--brand-ink": hslToHex({ h, s: inkS, l: inkL }),
    "--brand-ink-hover": hslToHex({ h, s: inkS, l: inkL + 0.07 }),
    "--brand-ink-deep": hslToHex({ h, s: inkS, l: inkL - 0.05 }),
    "--brand-text": hslToHex({ h, s: clamp(inkS + 0.04, 0, 0.9), l: 0.12 }),
    "--brand-accent": hslToHex(accent),
    "--brand-accent-light": hslToHex(accentLight),
  };
}
