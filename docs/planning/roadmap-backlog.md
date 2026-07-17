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
makers; a painless exit ramp *off* those incumbents is a core wedge, not a
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

_Add new backlog items above this line with a short goal + scope note. Promote to
a real plan section once it's being designed._
