# Gwinn Design System — "Pearl Jeweller"

The single design language for the whole app. The marketing surface and the
merchant/storefront surface share **one** warm, handcrafted system — the
slate/violet "dev-tool" skin is retired. **There is zero `slate-*` / `violet-*`
left in the app.**

> **Source of truth:** `client/src/index.css` — `:root { --brand-* }` (raw hex,
> use these for new work) and `@theme inline { --color-* }` (shadcn/Tailwind
> semantic tokens in oklch). This document explains how to use them.

---

## Color

### Brand tokens (`--brand-*`, hex) — use these for new work

| Token                  | Hex       | Role                                                          |
| ---------------------- | --------- | ------------------------------------------------------------- |
| `--brand-ground`       | `#F7F3EE` | Oyster cream — page background                                |
| `--brand-surface`      | `#EDE7DF` | Warm ivory — filled chips, icon wells, footer                 |
| `--brand-surface-2`    | `#FAF8F4` | Lightest surface — hover, inset                               |
| `--brand-surface-3`    | `#F0EBE3` | Slightly deeper surface                                       |
| `--brand-ink`          | `#2D2620` | Warm mahogany — hero/CTA bands, primary buttons, logo bg      |
| `--brand-ink-hover`    | `#3A3028` | Ink hover                                                     |
| `--brand-ink-deep`     | `#231E19` | Deepest ink                                                   |
| `--brand-text`         | `#1C1714` | Near-black ink — headings/body on light                       |
| `--brand-accent`       | `#B8963E` | Refined gold — the one accent (eyebrows, links, checks, ring) |
| `--brand-accent-light` | `#D4B060` | Gold hover                                                    |
| `--brand-muted`        | `#7A6D65` | Warm taupe — captions, micro-labels                           |
| `--brand-muted-2`      | `#6B5E52` | Body text on light (a touch darker)                           |
| `--brand-border`       | `#E0D8CC` | Hairline borders                                              |
| `--brand-border-2`     | `#DDD4C9` | Slightly stronger border / input                              |

**Never a cold grey** — every neutral carries a warm brown/amber undertone.
**Gold is the only accent** — spend boldness there and keep everything else quiet.

### Semantic tokens (`@theme`, oklch) — for shadcn/ui components

`--color-background oklch(96.5% .008 75)` · `--color-foreground oklch(13% .012 50)` ·
`--color-primary = foreground` (ink) ·
`--color-secondary / --color-accent / --color-ring oklch(63% .09 75)` (gold) ·
`--color-border oklch(87% .012 75)` · `--color-destructive oklch(55% .22 27)` ·
`--radius: 0.125rem` (near-square corners).

### State colors (kept separate from the gold accent)

- **Live / success:** `emerald-50/500/700`, border `emerald-200`
- **To-do / attention:** `amber-50/500/800`, border `amber-200`; warning numbers `amber-700`
- **Error:** `rose-600`

---

## Typography

Loaded via Google Fonts in `client/index.html`.

| Var            | Family                      | Use                                                                   |
| -------------- | --------------------------- | --------------------------------------------------------------------- |
| `--font-serif` | Cormorant Garamond (wt 400) | All headings (h1–h6 get it via base CSS), titles, prices, blockquotes |
| `--font-sans`  | Inter (300–600)             | Body, 15px / line-height 1.65, labels, data                           |
| `--font-hand`  | Caveat (wt 500)             | Handwriting accent only                                               |

`.font-hand` bumps size to `1.35em` (Caveat runs small). Body base is warm and
readable; headings are **serif weight-400 — no bold** (don't add `font-semibold`
to a serif heading).

---

## The hand-drawn system + the one guardrail

**The rule (hold this line):** if a pixel carries information a user acts on, it
stays crisp; if it only carries feeling, it can carry the pen.

- **Pen / handwriting is allowed on:** eyebrows, section dividers, hero
  underlines, empty states, illustrations, decorative arrows.
- **Pen is forbidden on:** numbers, money, tables, form inputs, status pills,
  CTAs — those stay crisp serif/sans with `tabular-nums`.

**Reusable decorative primitives** — `client/src/components/SketchAccents.tsx`:
`SketchUnderline`, `SketchDivider`, `SketchCircle`, `SketchArrow`. All are
`aria-hidden`, `pointer-events:none`, drawn in `currentColor` (so a parent sets
the hue — usually gold via `text-[var(--brand-accent)]`). Reuse these for any new
hand-drawn touch.

---

## Reusable components & patterns

- **Admin:** `CapabilityBand.tsx` — four-pillar status strip with semantic
  `StatusPill` tones (`live` / `ready` / `todo`).
- **Marketing visuals:** `MarketingIllustrations.tsx` → `OneInventoryDiagram`,
  `PhotoToListing`, `MarketStallScene` (warm HTML + `currentColor` SVG line-art;
  no external images).

### Copy-paste class patterns

- **Primary button (light bg):** `bg-[var(--brand-ink)] text-white text-xs uppercase tracking-[0.12em] rounded-md px-… hover:bg-[var(--brand-ink-hover)]`
- **Primary on a dark/hero band:** `bg-[var(--brand-accent)] text-[var(--brand-ink)] hover:bg-[var(--brand-accent-light)]`
- **Secondary / outline:** `border border-[var(--brand-ink)]/25 text-[var(--brand-ink)] hover:bg-[var(--brand-ink)] hover:text-white`
- **Card:** `bg-white border border-[var(--brand-border)] rounded-lg/xl`
- **Eyebrow:** `font-hand text-2xl leading-none text-[var(--brand-accent)]`
- **Hero / CTA band:** `bg-[var(--brand-ink)]` with white text + gold eyebrow.

---

## Logo / icon guidance

The mark is the **gold-on-mahogany** brush-Z lockup: a near-square mahogany tile
(`#2D2620`) with a hand-inked gold "Z" (`#B8963E`) and a small cream spark.
Assets live in `client/public/` — `logo.svg`/`logo.png`, `favicon.svg`,
`favicon.png`, multi-size `favicon.ico`, and the 1200×630 `og-image.png`. The nav
mark is the inline `BrushMark` in `client/src/marketing/components/MarketingChrome.tsx`.

When evolving the mark, stay inside the system:

- **Gold on mahogany (`#B8963E` on `#2D2620`) is the signature pairing** — use it
  for the mark and favicon. **Never violet.**
- Draw with the SketchAccents line language: stroke weight ~1.5–2, round
  caps/joins, a slightly imperfect / hand-inked feel to signal "made by hand."
- Pair any wordmark with **Cormorant Garamond**; reserve Caveat for a tagline
  flourish, never the mark itself.
- Provide **light-ground (`#F7F3EE`)** and **dark-ground (`#2D2620`)** lockups;
  the mark must read at **32px** (nav) and **16px** (favicon).
- Radius language is **near-square** (`--radius: 0.125rem`) — avoid pill /
  `rounded-lg` logo containers.

Per-tenant storefronts override the favicon/tab identity with their own uploaded
icon (or a generated initial-mark in their brand colour); see
`server/storefrontHead.ts`.
