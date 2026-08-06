# Zolto — Roadmap Backlog

Forward-looking items captured from the founder, not yet scheduled or built.
This is a **planning** doc: when an item is designed/started, move its detail
into the relevant plan and track shipping in
[`phase1/tracker.md`](./phase1/tracker.md).

---

## 1. Migrate-in from existing POS / website platforms

**Goal:** let a small business move to Zolto from whatever they're on today with
as little friction as possible — ideally a guided "import your store" step in
onboarding. The whole premise of Zolto is that incumbents overcharge small
makers; a painless exit ramp _off_ those incumbents is a core wedge, not a
nice-to-have.

**Sources to support (Switzerland-first, then broad):**

- **Shopify** — catalogue, variants, inventory levels, collections, customers,
  orders. (CSV product export + Admin API.)
- **Square** — items/catalogue, inventory, customers, past sales. (Square
  Catalog/Inventory API + CSV.)
- **Stripe** — existing products/prices, customers, and (for continuity)
  subscriptions/payment history. (Stripe API + CSV.)
- **Worldline / SIX (Swiss terminals)** — the dominant card-terminal path for
  Swiss small businesses; import transaction history / product lists where an
  export exists (often only CSV/statement exports — may need a parser).
- **Wix / Squarespace / WooCommerce** — common small-store website builders;
  catalogue + orders via CSV/export.
- **Generic CSV** — a well-documented column mapping as the universal fallback
  (Zolto already has a CSV importer for products; extend it into a first-class,
  mapping-driven "bring your catalogue" flow).

**Scope notes / open questions (refine later):**

- What's the minimum viable import? Almost certainly **catalogue + inventory
  levels + product images** first (that's the painful, high-value part). Orders
  and customers are a second pass.
- Per-source auth: OAuth app (Shopify/Square) vs API key (Stripe) vs pure CSV
  upload (Worldline/Wix). Start with CSV mapping + Shopify, since those cover the
  most makers fastest.
- Image handling: re-host imported product images into Zolto's S3 (imported URLs
  will rot / be access-controlled on the source).
- De-dupe on re-import (Zolto's CSV importer already matches by name — reuse
  that).
- Money/tax: normalize currency + Swiss VAT fields on import.

**Why it matters (positioning):** "Switch in an afternoon, keep your inventory in
sync, pay a fraction" is the migration story that turns the pricing argument
(below, and in the About page) into an actual signup.

**Update 2026-08-06 — the catalogue half shipped, and the payments half has a
plan.** `server/providerMigration.ts` imports catalogues from Stripe (API),
SumUp and Worldline (Swiss-format CSV). What is *not* built is letting a
merchant keep their existing provider for the payments themselves;
[`bring-your-own-payments.md`](./bring-your-own-payments.md) works through what
that takes, and finds the Stripe case already works via Connect. "Keep your
Worldline contract, get a shop this weekend" is the wedge this item was reaching
for.

---

## 2. Founder "About me" page (casual, personal)

A deliberately **casual, first-person** page that breaks from the site's otherwise
professional tone — the founder's story and the "why you should trust me" pitch.
Full content draft (voice, structure, and the open questions to answer) lives in
[`phase1/content/about-founder.md`](./phase1/content/about-founder.md).

Build notes for when it's implemented:

- Lives on the **marketing** surface (e.g. `/about` or `/story`), not the tenant
  storefront.
- One-column, long-form, personal — not the card-grid marketing look.
- Links out to the founder's LinkedIn (URL TBD — see the content draft's
  questions).

---

## 3. Third item — TO BE CONFIRMED

> The founder mentioned wanting to add a **third** thing to the plan alongside
> (1) platform migration and (2) the About page, but couldn't recall it in the
> moment and asked to be reminded.
>
> **ACTION: remind the founder to fill this in.** Placeholder kept here on
> purpose so it isn't lost.

---

## 4. Material / gem-type filter on the shop page

**Goal:** let shoppers filter products by material/gem (pearl, silver, gemstone
colour), alongside the existing category filter (Necklaces/Earrings/Rings/
Bracelets/etc.). Raised by the founder while confirming Kalakosh's category
list matches `shared/const.ts` (already correct — Necklaces, Earrings, Rings,
Bracelets, plus Sets/Bangles/Anklets/Brooches/Hair Accessories/Other, no
changes needed there).

**Scope (when it's built):**

- New `products` column (enum or free-text) for material/gem — needs a migration.
- Wire into the admin product form, CSV importer, and the WhatsApp/Slack/Discord
  auto-listing LLM parsers (so material is extracted alongside name/price/category).
- Filter control on the Shop page next to the category filter.
- Tests for all of the above per this repo's testing rule (new server logic +
  client hooks need coverage in the same change).

---

## 5. AI-agent readiness — discoverability + MCP

**Goal:** make Zolto and every storefront legible and usable by LLMs and AI
agents — both so assistants can _find and recommend_ a maker's products
(discovery/SEO for the AI era) and so agents can _interact_ programmatically.
Founder note (2026-07): "make the website friendly for LLMs and other AI agents;
proper robots/AI txt; offer an MCP service so clients can interact and customers
can discover products via MCP and easy browsing."

**Shipped (Phase 1, week 2):**

- **AI-crawler `robots.txt`** — explicitly welcomes GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, etc., and advertises `/llms.txt`
  (`shared/marketing.ts`, served by `server/seo.ts`).
- **`/llms.txt` + `/llms-full.txt`** (llmstxt.org format), tenant-aware: the
  platform apex serves a rich Zolto brief (features, pricing, how-to-start, MCP
  pointers) and a long-form `/llms-full.txt` with full feature/plan/FAQ content;
  each storefront serves a product-aware brief from its live catalogue
  (`server/llms.ts`, `shared/marketing.ts`).
- **Server-rendered marketing SEO** (`server/marketingSeo.ts`) — because the app
  is a client-rendered SPA and most AI crawlers don't run JS, the server now
  injects per-route `<title>`, meta description, canonical/OG, JSON-LD, and a
  `<noscript>` summary into the served HTML for every marketing route (landing,
  pricing, signup, blog, posts, story). JSON-LD: `Organization`, `WebSite`,
  `SoftwareApplication` + `AggregateOffer` (the plans), `FAQPage`, `Article`,
  `BreadcrumbList`. Wired into both dev and prod serving (`server/_core/vite.ts`),
  gated to the marketing host so it's a no-op for storefronts.
- **Surface-aware MCP** at `POST /mcp` (`server/mcp.ts`):
  - _Storefront_ (tenant resolves): `search_products`, `get_product`,
    `list_categories`, `get_store_info`.
  - _Platform / marketing_ (no tenant, e.g. zolto.com): `get_platform_info`,
    `list_features`, `get_pricing`, `how_to_start`, `list_faqs`,
    `list_resources` — so an AI assistant helping a prospective shop owner can
    discover Zolto's features/pricing and how to sign up, and recommend it.
- **Brand logo + per-tenant favicons** — a brush-Z mark (`client/public/logo.*`,
  `favicon.svg/png`, multi-size `favicon.ico`, 1200×630 `og-image.png`) wired into
  the nav, `<head>`, and JSON-LD/OG. Storefronts no longer inherit Zolto's icon:
  `server/storefrontHead.ts` rewrites each storefront's `<head>` to its own
  favicon (uploaded `faviconUrl`/`logoUrl`, or a generated initial-mark in the
  tenant's `primaryColor`) and tab title/OG identity. Both marketing SEO and
  storefront branding are dispatched from `server/htmlHead.ts` in the serving
  path. Tenant-supplied values are escaped; favicon URLs are scheme-restricted.
- **Single source of truth** for platform facts (`shared/platform.ts`:
  PLATFORM/FEATURES/PLANS/FAQS/HOW_TO_START) feeds the pricing page, JSON-LD,
  llms.txt/full, and the platform MCP tools so they never drift.
  Tests: `shared/platform.test.ts`, `server/marketingSeo.test.ts`,
  `server/mcp.test.ts`, `server/llms.test.ts`, `shared/marketing.test.ts`.

**Backlog (next passes):**

- **Write/interaction MCP** for tenant clients: add-to-cart / create checkout
  session / order status — needs auth (per-tenant API key or OAuth) and careful
  scoping; the "clients interact with the website" half of the note. Keep the
  human-in-the-loop rule for anything touching payments/inventory.
- **Server-initiated streaming (SSE)** on the MCP transport for long-running or
  progress-reporting tools, and MCP **session management** if stateful tools land.
- **Adopt the official `@modelcontextprotocol/sdk`** if/when we need the full
  transport surface (the v1 handler is a focused hand-rolled JSON-RPC dispatcher).
- **Agent-friendly structured data** beyond JSON-LD: per-product `Offer`/`Product`
  feeds, a machine-readable catalogue export, and a `/.well-known/` agent manifest
  if a standard settles.
- **Analytics for AI referrals** — attribute visits/sales that originate from AI
  assistants (distinct from classic organic search).

---

_Add new backlog items above this line with a short goal + scope note. Promote to
a real plan section once it's being designed._
