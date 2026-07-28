# Zolto — Pricing Pivot: Free In-Person, Skim Online/Agent Sales

> Companion to `./honest-pricing-strategy.md` (the currently-shipped model) and
> `./zolto-business-plan.md` (§4). This document is a **handoff, not yet
> implemented** — it proposes a different pricing philosophy than the one live
> in code today and flags exactly where the two disagree.
> Document version: 1.0 (new proposal, unreconciled)

---

## 0. Read this first: this contradicts the shipped pledge

`honest-pricing-strategy.md` v1.2 and `shared/platform.ts` (`PRICING_PROMISE`)
are **live in code and covered by tests**:

- `PRICING_PROMISE.points`: *"Your customers pay into your own Stripe account —
  we take 0% of your sales and never touch your money."*
- `server/routers/checkout.ts:63` — `PLATFORM_APPLICATION_FEE_RAPPEN = 0`, with
  a comment: *"Kept at 0 to honor the 'we take no cut' promise... change this
  (and that doc) together if the platform ever starts monetizing storefront
  checkout."*
- `server/checkout.test.ts:407` — `"pins application_fee_amount at 0 — Zolto
  takes no cut of the direct charge"`.
- Current tiers are **Free / Maker (19) / Studio (49) / Atelier (99)**, priced
  around domain/support/seats/SLA, not a sales skim (`shared/platform.ts:151`).

The plan below proposes the opposite: a **0.5–1% Stripe Connect
`application_fee` on online + agent-originated sales**, and a collapse to
**two tiers (Free / Pro) for launch**. Both are direct reversals of a written,
tested, public pledge — that's a business decision, not a docs edit, so this
document stops short of touching `PRICING_PROMISE`, the fee constant, or the
tests. **Do not flip `PLATFORM_APPLICATION_FEE_RAPPEN` or reword
`PRICING_PROMISE` until this plan (or a reconciled version of it) is
explicitly approved** — the code comment already anticipates this exact fork
and was written so the two changes land together, deliberately, not as a
silent drift.

Useful fact for scoping: the online-skim mechanism already has a placeholder
wired end-to-end (`checkout.ts:279` passes `application_fee_amount` into the
Stripe session) — turning the skim on for **online** checkout is a
one-constant change plus copy/test updates. The **agent-originated** and
**native TWINT** pieces below are the actual new build.

---

## 1. Context in one line

Stop selling hosting cheap and AI as premium. Go free where the market is
already free (in-person), monetize only incremental online/agent sales we
create, and give a graduation path that rewards vendor growth.

---

## 2. Decisions locked (as handed off — not yet reconciled with the pledge above)

1. **Free tier** — mobile store, POS, inventory + POS sync, and a taste of AI.
   CHF 0/month. In-person payments run through **native TWINT QR (1.3%);
   Zolto takes nothing in-person.**
2. **Revenue share** — a **~0.5–1% Stripe Connect `application_fee` on online
   + agent-originated sales only.** Zero in a month with no online sales
   (the seasonality answer).
3. **Pro tier (~CHF 19–29/mo)** — removes the skim, unlocks full/unmetered AI
   + the agent layer (llms.txt, MCP, chat-agent). Metered on **scale**
   (products, photos, storage), **never on AI queries**.
4. **Business tier (later, ~CHF 39–59)** — multi-stall/location, team seats,
   priority support, advanced agent analytics. For the SMB wave, not launch.
5. **Upsell trigger** — Pro beats a 1% skim once online sales pass ~CHF
   2,500/month. Surface "you'd save CHF X on Pro this month" in-app.

**Killed (do not build):** the CHF 2/mo hosting tier, the no-AI basic tier,
AI-query metering, and the separate "AI marketing" carve-out. (Note: today's
shipped model never had these either — it has Free/Maker/Studio/Atelier and
metered AI *photo credits*, not AI-query metering. The "kill list" reads as
if written against the business-plan's original four-tier sketch, not against
what's actually live — see §7.)

---

## 3. Payments architecture

- **In-person → native TWINT QR** (cheapest for the vendor; not our channel
  to tax).
- **Online + agent sales → Stripe Connect**, with `application_fee` for the
  skim.
- **Do not** route in-person sales through Stripe — the CHF 0.30 fixed fee
  only stops mattering at the ~CHF 50 basket, and we're not competing on the
  in-person rail anyway.

**As shipped today**, in-person POS sales already go through Stripe (Tap to
Pay and a Stripe-issued `twint` PaymentIntent — see `server/pos.ts:970`,
`/api/pos/twint-intent`), on the tenant's own connected account, with no
platform fee. There is **no native (non-Stripe) TWINT integration in the
codebase** — that's new build, not a routing change. Before committing to it,
close the open question below: verify the effective rate a tenant gets on
Stripe TWINT today vs. a native TWINT acquirer integration, since "native"
implies a second acquirer relationship, reconciliation path, and payout flow
to build and support alongside Stripe Connect.

---

## 4. Build workstreams

- **Stripe Connect fee activation:** flip `PLATFORM_APPLICATION_FEE_RAPPEN`
  (or replace the flat constant with a % calculation) for online sales;
  scope an equivalent fee path for agent-originated sales if they don't
  already flow through the same checkout function.
- **Native TWINT QR:** in-person integration; verify effective rate before
  wiring (see open questions).
- **Tier gating:** feature flags for Free vs Pro. Agent layer stays **on in
  Free** (it's the discovery wedge) and is monetized via the skim; Pro swaps
  skim for a flat fee + unmetered AI + more scale. Collapsing today's four
  tiers (Free/Maker/Studio/Atelier) to two (Free/Pro) is itself a change —
  decide whether Maker/Studio/Atelier retire or fold into "Pro" + "Business."
- **Upsell engine:** track online sales per vendor, compute skim-vs-Pro
  break-even, trigger the in-app prompt.
- **Scale metering:** enforce tier limits on products/photos/storage only.
  (This can likely reuse the existing `includedPhotoCredits` / AI Photo
  Credits metering already shipped in `shared/platform.ts`, rather than
  building new metering from scratch.)

---

## 5. Instrumentation (the make-or-break metric)

- **North star:** % of free in-person vendors who make ≥1 online/agent sale
  per month. This single number decides whether the business floats — a
  free-forever in-person-only vendor pays CHF 0.
- Also track: online GMV per vendor, skim revenue, Pro conversion, churn
  (watch off-season), and **agent-originated sales as a distinct channel**
  (proves the differentiator and tracks it against Shopify's free Agentic
  plan encroaching).

None of this exists in the codebase yet (no `usage_events`-style table, no
per-channel sales attribution). It's the same gap flagged in
`honest-pricing-strategy.md` §11 ("Metering implementation needs a
`usage_events` table") — the two plans can likely share that build.

---

## 6. Open questions to close before/at launch

- Exact skim %: 0.5 vs 1 — model against the ~CHF 50 basket and expected
  online volume (note: 1% puts online effective rate slightly above Square
  Free, so the bundle has to visibly earn it).
- Pro price: CHF 19 vs 29 — test. (Shipped `Maker` tier is already CHF 19 —
  if Pro absorbs Maker, this may already be answered.)
- **Verify TWINT-via-Stripe effective rate against native 1.3%** and decide
  the in-person rail accordingly.
- Off-season: is skim-only enough, or do we also offer Pro pause / annual
  billing?
- Speed vs Shopify Agentic: how fast to ship agent-layer prominence.
- **New, raised by this doc:** does this pivot replace or coexist with the
  shipped `PRICING_PROMISE` ("we take 0% of your sales")? If it replaces it,
  the pledge copy, Pricing page, `/llms.txt`, `/llms-full.txt`, and the
  platform MCP `get_pricing` tool all need to change together (same pattern
  `honest-pricing-strategy.md` §7.1 used to reconcile its own earlier
  contradiction) — and `checkout.test.ts`'s "Zolto takes no cut" test needs
  to be rewritten to assert the new (non-zero) fee instead of deleted.

---

## 7. Reconciliation note for whoever picks this up

This handoff reads like it was written against the **business plan's original
four-tier sketch** (business-plan §3.1 pre-`honest-pricing-strategy.md`), not
against the **currently shipped** Free/Maker/Studio/Atelier + 0%-take +
pay-per-use-photo-credits model. Two things worth resolving before Phase 1
work starts, so engineering isn't asked to build against a moving target:

1. Confirm whether this pivot **supersedes** `honest-pricing-strategy.md`
   (i.e., the 0%-take pledge is retired in favor of a disclosed skim) or is
   meant to **extend** it (e.g., skim only applies to a new "agent-originated"
   channel the honest-pricing doc didn't anticipate, while direct storefront
   checkout stays at 0% as pledged).
2. If it supersedes: this is a public-facing promise reversal, not just a
   pricing-table edit — it should go through the same explicit,
   human-reviewed path business-plan §1.3/§8.1 requires for billing changes
   ("No AI-authored change to billing ships without a human merge").

---

## 8. Sequencing (as handed off)

- **Phase 1 (launch):** Free + native TWINT in-person + Stripe Connect online
  skim. Two boxes only — Free and Pro. Retire the old tiers.
- **Phase 2:** upsell engine + instrumentation dashboards.
- **Phase 3:** Business tier once agent layer and multi-location are proven.

---

> Recorded as handed off, cross-referenced against the shipped code and the
> existing `honest-pricing-strategy.md` so the next actor can see exactly
> where the two plans agree, where they conflict, and what in code would
> need to move (and where) if this version is the one that ships.
