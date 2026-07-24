/**
 * Storefront palette derivation.
 *
 * A tenant only stores a single dominant brand color (`tenant_settings.primary_color`).
 * From that one hex we derive the whole *dark* half of the storefront palette — the
 * ink family (hero / footer / primary buttons) plus a lighter, more vivid accent of
 * the same hue (dividers, eyebrow labels, hover states). The warm-neutral *surfaces*
 * (the cream grounds and borders) are intentionally left to their CSS defaults, so a
 * store picks its brand color and gets a cohesive "<color> + cream" look without
 * having to specify a second accent.
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
 * Derive the ink family + accent from a single dominant brand color.
 *
 * The input is treated as the dominant dark (`--brand-ink`). Hover/deep are small
 * lightness steps around it; text is a near-black of the same hue; the accent is a
 * lighter, more saturated tint of the hue (so a navy brand yields a mid-blue accent,
 * not gold). Surfaces/borders are deliberately not returned — they keep their cream
 * defaults.
 *
 * Returns null for an unparseable color so callers can fall back to CSS defaults.
 */
export function derivePalette(primaryColor: string): BrandPalette | null {
  const hsl = hexToHsl(primaryColor);
  if (!hsl) return null;

  const { h, s } = hsl;
  // Anchor the ink lightness into a sensible "dominant dark" band even if the tenant
  // supplied something a bit light or nearly black, so the derived family stays legible.
  const inkL = clamp(hsl.l, 0.14, 0.34);
  const inkS = clamp(s, 0.08, 0.9);

  return {
    "--brand-ink": hslToHex({ h, s: inkS, l: inkL }),
    "--brand-ink-hover": hslToHex({ h, s: inkS, l: inkL + 0.07 }),
    "--brand-ink-deep": hslToHex({ h, s: inkS, l: inkL - 0.05 }),
    "--brand-text": hslToHex({ h, s: clamp(inkS + 0.04, 0, 0.9), l: 0.12 }),
    // Accent: same hue, clearly lighter and more vivid so it reads as a highlight
    // against both the ink and the cream surfaces.
    "--brand-accent": hslToHex({
      h,
      s: clamp(inkS + 0.12, 0.35, 0.95),
      l: 0.52,
    }),
    "--brand-accent-light": hslToHex({
      h,
      s: clamp(inkS + 0.1, 0.3, 0.95),
      l: 0.64,
    }),
  };
}
