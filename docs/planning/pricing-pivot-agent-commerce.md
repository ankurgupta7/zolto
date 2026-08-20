# Gwinn — Pricing Pivot: Free In-Person, Skim Online/Agent Sales

> Companion to `./gwinn-business-plan.md` (§4). **This is the shipped pricing
> model.** It supersedes `./honest-pricing-strategy.md`, which described the
> retired four-tier / 0%-take model and is kept only as history.
> Document version: 2.0 (implemented)

---

## 0. Status: shipped

The pivot below is **implemented in code**, superseding the previous
0%-take pledge by explicit owner decision. What changed:

| Area | File | Change |
|---|---|---|
| Plans + fee constants | `shared/platform.ts` | Two tiers (Free / Pro CHF 25), `REVENUE_SHARE`, `PRO_BREAK_EVEN_ONLINE_CHF`, rewritten `PRICING_PROMISE` |
| DB | `drizzle/schema.ts`, `drizzle/0008_two_tier_pricing.sql` | `tenants.plan` enum → `free`/`pro` (paid tiers backfilled to `pro`); `orders.channel` (`web`/`agent`) + `orders.platform_fee_rappen` |
| Online skim | `server/routers/checkout.ts` | `application_fee_amount` = 1% of product subtotal for Free tenants, omitted for Pro; `channel` input recorded on the order |
| In-person | `server/pos.ts` | Untouched — POS sales carry no platform fee on any plan |
| Subscription billing | `server/billing.ts` | Single `STRIPE_PRICE_PRO`; photo-credit packs retired (stale sessions logged, not processed) |
| Feature gating | `server/_core/trpc.ts` | `PLAN_FEATURES` collapsed to `free`/`pro`; upgrade path names Pro |
| AI metering | `server/photoCredits.ts`, `server/db.ts` | Per-query credits replaced by a monthly plan allowance (Free 5, Pro unmetered); ledger is now a usage log |
| Scale metering | `server/db.ts` `createProduct` | Catalogue cap enforced at the single write choke point, so every intake channel obeys it |
| Upsell engine | `server/routers/billing.ts`, `client/src/pages/Billing.tsx` | `getMonthlyOnlineSales` + break-even math → "you'd save CHF X on Pro this month" |
| Marketing/agent surfaces | `Pricing.tsx`, `Landing.tsx`, `shared/marketing.ts`, `server/mcp.ts` | Fee model disclosed on the pricing page, in `/llms.txt`, `/llms-full.txt`, and MCP `get_pricing` |

**The agent half of this model is now real:** every storefront's MCP endpoint
gained a `create_checkout` tool, so any AI agent can buy from a merchant
directly and the resulting order is attributed `channel: "agent"` and carries
the fee. Before that, nothing in the product could produce an agent-originated
sale — the differentiating revenue was unreachable. See
[`./feature-backlog-assessment.md`](./feature-backlog-assessment.md).

Full suite green and `tsc --noEmit` clean at the time of writing. **Still open before launch:** the native TWINT rail (§3) is not
built — in-person still runs on Stripe TWINT, which is correct on fee
grounds (Gwinn takes nothing in person either way) but not yet the
cheapest rail for the vendor.

---

## 0b. History: what this superseded

`honest-pricing-strategy.md` v1.2 and `shared/platform.ts` (`PRICING_PROMISE`)
are **live in code and covered by tests**:

- `PRICING_PROMISE.points`: *"Your customers pay into your own Stripe account —
  we take 0% of your sales and never touch your money."*
- `server/routers/checkout.ts:63` — `PLATFORM_APPLICATION_FEE_RAPPEN = 0`, with
  a comment: *"Kept at 0 to honor the 'we take no cut' promise... change this
  (and that doc) together if the platform ever starts monetizing storefront
  checkout."*
- `server/checkout.test.ts:407` — `"pins application_fee_amount at 0 — Gwinn
  takes no cut of the direct charge"`.
- Current tiers are **Free / Maker (19) / Studio (49) / Atelier (99)**, priced
  around domain/support/seats/SLA, not a sales skim (`shared/platform.ts:151`).

All three were reversed together, deliberately, in the same change — the
old code comment on the fee constant had anticipated exactly this fork and
asked for precisely that. The pledge was **rewritten rather than deleted**:
Gwinn still never holds a vendor's money and still charges nothing on
in-person sales; what changed is that online and agent-originated orders now
carry a disclosed 1% on the Free plan.

---

## 1. Context in one line

Stop selling hosting cheap and AI as premium. Go free where the market is
already free (in-person), monetize only incremental online/agent sales we
create, and give a graduation path that rewards vendor growth.

---

## 2. Decisions locked (shipped, except where noted)

1. **Free tier** — mobile store, POS, inventory + POS sync, and a taste of AI.
   CHF 0/month. In-person payments run through **native TWINT QR (1.3%);
   Gwinn takes nothing in-person.**
2. **Revenue share — shipped at 1%** (`REVENUE_SHARE.freeBps = 100`), as a
   Stripe Connect `application_fee` on online + agent-originated sales only,
   computed on the product subtotal and never on shipping. Zero in a month
   with no online sales (the seasonality answer).
3. **Pro tier — shipped at CHF 25/mo** (midpoint of the 19–29 range; revisit
   after launch data). Removes the skim, unlocks unmetered AI. Metered on
   **scale** (200 → 5,000 products, 5 → 50 GB), **never on AI queries**.
   Note the agent layer (llms.txt, MCP, store chat) deliberately stays **on
   in Free** — it is the discovery wedge, monetized by the skim.
4. **Business tier (later, ~CHF 39–59)** — multi-stall/location, team seats,
   priority support, advanced agent analytics. For the SMB wave, not launch.
5. **Upsell trigger — shipped.** Pro beats the 1% skim once online sales pass
   CHF 2,500/month (`PRO_BREAK_EVEN_ONLINE_CHF`, derived from the price and
   fee so it can never drift). The in-app prompt appears on the Billing page
   the moment the month's fees exceed Pro's price.

**Killed (do not build):** the CHF 2/mo hosting tier, the no-AI basic tier,
AI-query metering, and the separate "AI marketing" carve-out. The
pay-per-image AI photo credits (CHF 1/image) are retired along with them —
AI is now a plan allowance, never a per-query purchase.

---

## 3. Payments architecture

- **In-person → native TWINT QR** (cheapest for the vendor; not our channel
  to tax).
- **Online + agent sales → Stripe Connect**, with `application_fee` for the
  skim.
- **Do not** route in-person sales through Stripe — the CHF 0.30 fixed fee
  only stops mattering at the ~CHF 50 basket, and we're not competing on the
  in-person rail anyway.

> **Marketing correction, August 2026.** `SOVEREIGNTY.ledger` used to describe
> both TWINT paths with one row reading "your own TWINT account — Swiss rails,
> end to end", which is true only of the QR sticker. The in-app button is a
> Stripe PaymentIntent and now has its own row, marked `moving`. See
> [`positioning-pricing-revision.md`](./positioning-pricing-revision.md) §4.
> The gap below is therefore now disclosed on the site, not only in this doc.

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

- ✅ **Stripe Connect fee activation** — the flat `PLATFORM_APPLICATION_FEE_RAPPEN`
  constant is replaced by `platformFeeRappen(plan, subtotal)`, reading
  `PLANS[].onlineFeeBps`. Agent-originated sales flow through the same
  `checkout.createSession`, so they pick up the fee automatically; the
  `channel` input only changes attribution.
- ⬜ **Native TWINT QR** — not built. In-person still runs on Stripe TWINT
  (`/api/pos/twint-intent`), fee-free to the vendor from Gwinn either way.
  Verify the effective rate before committing to a second acquirer.
- ✅ **Tier gating** — `PLAN_FEATURES` is `free`/`pro`. The agent layer
  (llms.txt, MCP, store chat) is deliberately **ungated**: it is the
  discovery wedge, monetized by the skim, not by a paywall.
- ✅ **Upsell engine** — `getMonthlyOnlineSales` + `PRO_BREAK_EVEN_ONLINE_CHF`
  drive `billing.getStatus().upsell`, rendered on the Billing page.
- ✅ **Scale metering** — `maxProducts` enforced in `createProduct` (the one
  write choke point every intake channel shares). Storage caps are declared
  in `PLANS[].storageGb` and surfaced in the UI but not yet enforced at
  upload time — the next metering task.

---

## 5. Instrumentation (the make-or-break metric)

- **North star:** % of free in-person vendors who make ≥1 online/agent sale
  per month. This single number decides whether the business floats — a
  free-forever in-person-only vendor pays CHF 0.
- Also track: online GMV per vendor, skim revenue, Pro conversion, churn
  (watch off-season), and **agent-originated sales as a distinct channel**
  (proves the differentiator and tracks it against Shopify's free Agentic
  plan encroaching).

**Shipped: the operator dashboard.** `platform.metrics` (superadmin only) and
`/admin/account/platform` compute and display the north star — the share of
free in-person vendors who also sold online or via an agent this month —
alongside online GMV, fees earned, the agent-originated split, in-person GMV
(never monetized), Pro conversion, and subscription health. The denominator is
free vendors who *actually sold in person* this month, not every free signup:
counting dormant tenants would move the ratio for the wrong reason.

**The data layer for all of this now exists.** `orders.channel`
(`web`/`agent`) and `orders.platform_fee_rappen` make online GMV, skim
revenue, and agent-originated sales queryable per tenant and per month
(`getMonthlyOnlineSales`); in-person sales stay in `pos_orders`, so the
three channels are cleanly separable. What's left is the **platform-side
dashboard** that aggregates this across tenants to compute the north-star
number — the per-tenant half is already live in the merchant's own Billing
page.

---

## 6. Open questions still to close

- **Skim %: shipped at 1%, revisit with data.** One constant
  (`REVENUE_SHARE.freeBps`) moves it to 0.5% — the pricing page, llms briefs,
  and MCP all render from it, so no copy hunt is needed.
- **Pro price: shipped at CHF 25**, the midpoint of the 19–29 range. Same
  property: `PLANS` is the only place it lives, and the break-even number
  recomputes itself.
- **Native TWINT: decided, blocked on TWINT itself.** The owner has chosen to
  move the in-person rail to native TWINT. Native is confirmed at **1.3%**, but
  Stripe's TWINT rate is not publicly documented, so the delta — the entire
  business case — is still unmeasured. The larger constraint is that TWINT's
  API is not public and any integrator must be **certified and approved by
  TWINT** before receiving the spec, so this starts as an application, not a
  branch. Credential model (Store UUID + `.p12` + password), codebase impact
  and recommended sequence:
  [`native-twint-integration.md`](./native-twint-integration.md).
- ~~**VAT: inclusive vs exclusive**~~ — **closed, not applicable.** Swiss VAT
  registration is mandatory only above CHF 100,000 of annual turnover
  (MWSTG art. 10). Gwinn is below that and pre-revenue, so there is no VAT to
  charge on Pro or on the platform fee, and Stripe Tax stays off. **Revisit
  when annual turnover approaches CHF 100k** — at that point registration
  becomes obligatory and prices must state which way they're quoted. Until
  then, prices in `shared/platform.ts` are simply the price.
- Off-season: is skim-only enough, or do we also offer Pro pause / annual
  billing?
- Speed vs Shopify Agentic: how fast to ship agent-layer prominence.
- ~~**Grandfathering**~~ — **closed, there were never any legacy
  subscribers.** See §8.

---

## 7. Sequencing

- ✅ **Phase 1 (launch):** Free + Stripe Connect online skim, two boxes only,
  old tiers retired. *Except* the native TWINT rail, still open.
- ✅ **Phase 2:** upsell engine (per-tenant) and the platform-wide metrics
  dashboard are both shipped.
- ⬜ **Phase 3:** Business tier once the agent layer and multi-location are
  proven.

---

> The model in this document is the one in the code. If you change a price,
> a fee, or a limit, change it in `shared/platform.ts` — the pricing page,
> `/llms.txt`, `/llms-full.txt`, MCP `get_pricing`, the admin Billing page,
> and checkout's fee math all derive from it, and the tests in
> `shared/platform.test.ts` will hold the story together.

---

## 8. Legacy subscribers — closed, there were none

Migration `0008` remapped the plan enum from Maker/Studio/Atelier to `pro`,
and this section used to carry a runbook for reconciling the tenants that
remap would have left billing an old Stripe price.

**That population never existed.** Gwinn is pre-launch: no paying tenants
when `0008` ran, and none since. The grandfathering machinery built for them
— `isLegacyPriceId`, the retired-tier inverse lookup, the
`tenants.plan_price_override` column, the Billing-page banner, and the
`STRIPE_PRICE_MAKER` / `_STUDIO` / `_ATELIER` env vars — has been **removed**
(migration `0012`). Retired tiers were never sellable anyway: `PRICE_ENV`
holds only `pro`, so no new subscription can land on one through the product.

What replaced it: `handleSubscriptionUpdated` now warns loudly when a
subscription carries a Price it doesn't recognise, and withholds only the
`plan` write while still syncing status and subscription id. That is the
honest general case — a mis-set `STRIPE_PRICE_PRO` is far likelier than a
grandfathered tenant, and it used to fail silently.

If a grandfathered price is ever genuinely needed (a promo, an enterprise
deal), reintroduce it deliberately then, rather than carrying an unread
column and three unused env vars until it happens.

---

## 9. Verification status of the fee path

The platform fee is the revenue mechanism of this whole model, so it's worth
being precise about what has and hasn't been proven:

- ✅ **Unit-tested** end to end with a mocked Stripe: fee maths, plan
  conditionality, channel attribution, subtotal-not-shipping basis.
- ✅ **Verified against the real Stripe API (2026-07-31).** With
  `STRIPE_TEST_SECRET_KEY`/`STRIPE_TEST_WEBHOOK_SECRET` set and a business
  name configured on both the platform and the connected test account,
  `pnpm test:integration` is fully green: `stripe.integration.test.ts` (7/7)
  and `billing.integration.test.ts` (9/9), 16/16 total. A direct charge with
  `application_fee_amount` is accepted by Stripe; the agent-channel and
  Pro/no-fee variants pass too. The prior blocker
  (`"you must set an account or business name"`) was Checkout branding
  config, not a fee rejection, and is now resolved. This was the last
  unproven link in the revenue path — it's closed.
- ✅ **Failure contained regardless.** A rejected application fee fails the
  *entire* `checkout.sessions.create` call, which would take a vendor's
  storefront offline rather than cost Gwinn 1%. `createStorefrontCheckoutSession`
  now retries once without the fee when — and only when — the error is
  fee-specific (`isPlatformFeeRejection`), logs loudly, and records `0` on the
  order. An un-monetized sale beats a lost one. If the integration run above
  comes back clean, this path should never fire; if it fires in production,
  the Connect relationship is misconfigured and the log says so.

