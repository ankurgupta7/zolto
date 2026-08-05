/**
 * Storefront templates — the five looks a merchant picks from at signup.
 *
 * A template is deliberately small: it names the *surface* half of the
 * storefront palette (the grounds, surfaces, borders, and muted text that
 * `derivePalette` intentionally leaves alone) plus a default primary color.
 * The merchant's own `primary_color` (chosen manually or extracted from their
 * logo) still drives the ink/accent half via `client/src/lib/palette.ts`, so
 * template × brand color compose instead of fighting.
 *
 * Every template ships the FULL set of surface variables (even `atelier`,
 * whose values equal the index.css defaults) so applying one is idempotent
 * and previews never need fallback logic.
 *
 * Shared between server (signup validation) and client (picker UI + theming),
 * so it must stay framework-free.
 */

export const TEMPLATE_IDS = [
  "atelier",
  "verdant",
  "porcelain",
  "bazaar",
  "azure",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** The signup wizard preselects this; it matches the index.css defaults. */
export const DEFAULT_TEMPLATE_ID: TemplateId = "atelier";

/** The surface-side `--brand-*` custom properties a template may override. */
export const TEMPLATE_CSS_VARS = [
  "--brand-ground",
  "--brand-surface",
  "--brand-surface-2",
  "--brand-surface-3",
  "--brand-border",
  "--brand-border-2",
  "--brand-muted",
  "--brand-muted-2",
] as const;

export type TemplateCssVar = (typeof TEMPLATE_CSS_VARS)[number];

export interface StoreTemplate {
  id: TemplateId;
  name: string;
  tagline: string;
  /** Who this look suits — shown on the signup picker cards. */
  bestFor: string;
  /** Seed for `primary_color` when the merchant doesn't pick their own. */
  defaultPrimaryColor: string;
  cssVars: Record<TemplateCssVar, string>;
}

export const STORE_TEMPLATES: readonly StoreTemplate[] = [
  {
    id: "atelier",
    name: "Atelier",
    tagline: "Warm cream and deep espresso ink",
    bestFor: "Handmade goods, jewellery, and craft studios",
    defaultPrimaryColor: "#2D2620",
    cssVars: {
      "--brand-ground": "#f7f3ee",
      "--brand-surface": "#ede7df",
      "--brand-surface-2": "#faf8f4",
      "--brand-surface-3": "#f0ebe3",
      "--brand-border": "#e0d8cc",
      "--brand-border-2": "#ddd4c9",
      "--brand-muted": "#7a6d65",
      "--brand-muted-2": "#6b5e52",
    },
  },
  {
    id: "verdant",
    name: "Verdant",
    tagline: "Sage surfaces and garden greens",
    bestFor: "Farm stands, florists, and food producers",
    defaultPrimaryColor: "#2F5D3A",
    cssVars: {
      "--brand-ground": "#f4f7f0",
      "--brand-surface": "#e7ede1",
      "--brand-surface-2": "#f9fbf6",
      "--brand-surface-3": "#ecf1e6",
      "--brand-border": "#d5dfca",
      "--brand-border-2": "#cfdac4",
      "--brand-muted": "#6f7a65",
      "--brand-muted-2": "#5e6b52",
    },
  },
  {
    id: "porcelain",
    name: "Porcelain",
    tagline: "Cool gallery whites, quiet and minimal",
    bestFor: "Fashion boutiques, ceramics, and design objects",
    defaultPrimaryColor: "#1F2933",
    cssVars: {
      "--brand-ground": "#f6f7f8",
      "--brand-surface": "#eceef0",
      "--brand-surface-2": "#fafbfc",
      "--brand-surface-3": "#eff1f3",
      "--brand-border": "#dce0e4",
      "--brand-border-2": "#d5dade",
      "--brand-muted": "#6e747a",
      "--brand-muted-2": "#5c636b",
    },
  },
  {
    id: "bazaar",
    name: "Bazaar",
    tagline: "Terracotta warmth with market-day energy",
    bestFor: "Market stalls, gifts, and vintage finds",
    defaultPrimaryColor: "#A34A24",
    cssVars: {
      "--brand-ground": "#faf3ee",
      "--brand-surface": "#f3e6dc",
      "--brand-surface-2": "#fdf8f4",
      "--brand-surface-3": "#f5eae0",
      "--brand-border": "#e8d5c4",
      "--brand-border-2": "#e2cdbb",
      "--brand-muted": "#8a7060",
      "--brand-muted-2": "#75604f",
    },
  },
  {
    id: "azure",
    name: "Azure",
    tagline: "Airy coastal blues, crisp and open",
    bestFor: "Wellness, stationery, and modern essentials",
    defaultPrimaryColor: "#1E4E79",
    cssVars: {
      "--brand-ground": "#f3f6f9",
      "--brand-surface": "#e5ebf2",
      "--brand-surface-2": "#f8fafd",
      "--brand-surface-3": "#eaf0f5",
      "--brand-border": "#d3dde8",
      "--brand-border-2": "#cbd7e3",
      "--brand-muted": "#68737f",
      "--brand-muted-2": "#57636f",
    },
  },
];

export function isTemplateId(value: unknown): value is TemplateId {
  return (
    typeof value === "string" &&
    (TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

/** Look up a template; unknown/absent ids return null so callers fall back to CSS defaults. */
export function getTemplate(
  id: string | null | undefined,
): StoreTemplate | null {
  if (!id) return null;
  return STORE_TEMPLATES.find((t) => t.id === id) ?? null;
}
