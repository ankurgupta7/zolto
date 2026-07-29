# Zolto — Honest Pricing Strategy

> ## ⚠️ SUPERSEDED — historical record only
>
> This document describes the **retired** pricing model: four tiers
> (Free / Maker 19 / Studio 49 / Atelier 99), a 0%-take pledge, and
> pay-per-image AI photo credits. None of that is in the code any more.
>
> **The shipped model is [`./pricing-pivot-agent-commerce.md`](./pricing-pivot-agent-commerce.md):**
> two tiers (Free / Pro CHF 25), free in person forever, a disclosed 1%
> platform fee on online + AI-agent orders for Free-plan tenants, and AI
> included by plan allowance rather than sold per query.
>
> Kept because the reasoning below — charge where cost is real, never gate
> zero-marginal-cost features, never hold a merchant's money or their data —
> still shapes the current model. The *numbers and tiers* are obsolete; do
> not implement anything from this file.

> Companion to `./zolto-business-plan.md` (§4) and `./monetization-code-roadmap.md`.
> This document refines the "four flat tiers" sketch in the business plan into a
> **cost-honest** model: we charge where our cost is real and variable, we keep the
> commerce engine free, we take **0% of your sales**, and we never charge you to leave.
> Document version: 1.1

> **v1.1 — reconciled with the marketing/positioning branch**
> (`claude/marketing-messaging-positioning-bw7b92`, source of truth `shared/platform.ts`):
> (1) currency is **CHF**, tiers are **Free / Maker / Studio / Atelier (0 / 19 / 49 / 99)**;
> (2) usage is **true pass-through at cost** — the earlier "cost + slim markup" is dropped,
> because the shipped `PRICING_PROMISE` pledges "we never charge for anything that isn't
> charged to us"; (3) **all margin lives in the subscription**, reframed as cost-recovery,
> not profit ("we have enough… not here to make money off small people"); (4) added **AI
> product photography** as the headline metered item (real GPU cost); (5) new §7.1 flagging
> the **promise-vs-plans contradiction** the branch still carries and the `PLANS` fix to
> resolve it.

> **v1.2 — the §7.1 fix is now implemented in code** (branch
> `claude/honest-pricing-plans`, off `main`). The promise-vs-plans contradiction is
> resolved: `PLANS` no longer carries the artificial caps, the whole zero-cost commerce
> engine sits on Free, and **AI product photography is shipped as a metered add-on**
> (`AI_PHOTO_CREDITS`) rather than a fictional "unlimited". Final numbers, now live in
> `shared/platform.ts`: **CHF 1 / image, pay-as-you-go, credits never expire**, with a
> **monthly included bucket per plan — Free 0, Maker 10, Studio 40, Atelier 150.** The one
> `PRICING_PROMISE` bullet that overclaimed literal zero-margin pass-through was reworded,
> and the add-on is surfaced on the Pricing page, `/llms.txt`, `/llms-full.txt`, and the
> platform MCP `get_pricing` tool. What is **not** yet settled: whether CHF 1/image is
> genuine pass-through or carries margin (see §4) — the price is a marketing anchor pending a
> real per-image cost check.

---

## 1. The one principle

**We charge you where serving you actually costs us money, and nowhere else. Where it does
cost us, we pass the cost straight through — at what it costs us, not a franc more.**

That single rule, and the shipped pledge behind it, decides everything below:

- If a feature costs us ~nothing at the margin (one more product row, one more POS sale,
  one more page view) → **it's free**, forever. Gating it would be a toll booth on a road
  that's already paid for.
- If an action has a **real, external, per-use cost** (an AI/GPU call, an email, a text
  message, a gigabyte) → **you pay per use, passed straight through at our cost.** No
  markup. The only thing we add is a cost that is itself *charged to us* — e.g. the Stripe
  fee on a micro-charge. You can see the meter.
- If we're holding a **standing commitment open for you** (a real person answering your
  questions, a domain + certificate + deliverability we keep alive, extra staff seats, an
  uptime promise) → **that's a subscription.** This is the *only* place our margin lives,
  and it's cost-recovery for keeping the lights and the support desk on — not a cut we take
  because we can.
- **Leaving is free.** Your catalogue, customers, and orders are yours. We will never put a
  price, a delay, or a dark pattern between you and your own data.
- **We take 0% of your sales.** Your money goes straight into your own Stripe account
  (Stripe Connect Standard — §6). We are not in the middle of your revenue.

This is the written pledge in `shared/platform.ts` (`PRICING_PROMISE`), stated as a rule:

> "We only make money when it's fair to. We will never charge you for anything that isn't
> charged to us. … We have enough money of our own — we are not here to make money off
> small people."

Everything below is just that pledge applied line by line, with the numbers shown.

---

## 2. Why this is different from the old guard

The positioning branch names the real foil: the **legacy payments + POS providers —
Stripe, SumUp, Worldline** — who overcharge small merchants and upsell card-reader
hardware to lock them in. Two shifts make that model obsolete: **AI builds the store in an
afternoon**, and **NFC phones + TWINT QR mean there's no card reader to sell** and server
cost is tiny. So a maker pays **~CHF 19/mo instead of ~CHF 2,000/yr — one-hundredth the
cost**.

| | Old guard (Stripe / SumUp / Worldline) | Generic SaaS (Shopify / Square) | **Zolto** |
|---|---|---|---|
| Card reader | Sold/rented to you, CHF 50–300+ | — | **None — your phone (NFC tap + TWINT QR)** |
| Cut of your sales | Processing % (theirs) | %+ unless you use *their* processor | **0% — money never touches us** |
| Base fee | Hardware + monthly + lock-in (~CHF 2,000/yr) | Flat monthly whether you sell or not | **Free core; pay only for variable-cost extras** |
| AI features | None | Bundled into a higher forced tier | **Passed through at cost, per use** |
| Your data on exit | Held, then paid out; sticky | Export exists, but nudged to stay | **Free full export, one click, any time** |
| What you pay for | Hardware + lock-in | Bundling | **Our actual marginal cost + honest cost-recovery** |

The product wedge (business plan) is *maker-first design + POS/online parity*. The pricing
wedge is *honesty*: a maker doing 40 sales a month should pay us almost nothing, because
they cost us almost nothing.

---

## 3. Free forever (marginal cost ≈ CHF 0)

Free because one more of them costs Zolto essentially nothing: a shared MySQL row, a
Cloudflare R2 object (~CHF 0.015/GB-month, **zero egress fees**), CPU we already pay for.
Charging here would be charging for air — and gating any of it is the manufactured-scarcity
dark pattern the pledge disowns.

| Feature | Why it's free (our cost) | Cost to you |
|---|---|---|
| Online storefront (subdomain) | Shared app server; marginal cost ≈ 0 | CHF 0 |
| Product catalogue — **unlimited items** | One DB row each | CHF 0 |
| Product images (fair-use storage, see §4) | R2 ~CHF 0.015/GB-mo, no egress | CHF 0 up to 5 GB |
| Cart + Stripe Checkout (cards + TWINT) | Stripe does the work | CHF 0 from us (you pay Stripe directly) |
| **POS — Tap to Pay, cash, TWINT QR** | Terminal session cost is Stripe's | CHF 0 from us |
| **Sell-by-amount + day-end AI reconciliation** | The reconcile email is one cheap AI call (§4 bucket) | CHF 0 (nominal AI usage) |
| Real-time inventory sync (POS ↔ online) | A DB write; the whole point of the product | CHF 0 |
| Order management, receipts, refunds | Standard app logic | CHF 0 |
| Staff/admin logins | An auth row costs ~nothing (seats are billed for *support surface*, not compute — §7) | CHF 0 on Free; more seats via plan |
| Basic analytics (sales, top products, channel split) | Aggregate queries on your own data | CHF 0 |
| WhatsApp/Slack/Discord "photo → draft product" intake | The *intake* is free; the AI write step is metered (§4) | CHF 0 (AI usage metered) |
| Generous AI **text** allowance (names, descriptions, translation) | llama3-class text is fractions of a cent — cheaper to give than to meter | CHF 0 within a fair monthly allowance |
| **Full data export** (CSV/JSON + image bundle) | Cheap to generate; not ours to charge for | CHF 0 (see §5) |
| `llms.txt` + MCP endpoint + SEO | Generated text; helps you get found | CHF 0 |

**Design note:** the free tier is a *complete, sellable store*, not a crippled demo. A
maker can run their whole business on CHF 0/month and we're glad to have them — they cost
us cents, they're the top of the funnel and the word-of-mouth engine (business plan §5),
and they pay us **when their own usage or growth makes paying worth it to them**, not
because we walled off the checkout button.

---

## 4. Pay-per-use (real variable cost — passed straight through, no markup)

Everything here has a cost that scales with usage and that we pay to someone else (an
LLM/GPU API, an email/SMS provider, a storage bill). So you pay per use, **at our cost.**
We publish the unit cost. The only add-on is a cost that is *itself charged to us* (e.g.
the Stripe fee to collect a micro-payment), which is why we pool tiny costs into
non-expiring credit packs instead of billing you CHF 0.0007 line items.

Text AI runs on Groq `llama3-8b` (~CHF 0.05–0.10 per **million** tokens) — so cheap we give
it away within a fair allowance (§3). The item that actually *needs* metering is **AI
product photography**: image restyling / on-model generation is real GPU time, orders of
magnitude pricier than text, and the one place "unlimited" would sink the unit economics.

| Feature | One unit | Our real cost / unit | **You pay (pass-through)** | Why metered (not free, not "unlimited") |
|---|---|---|---|---|
| **AI product photography** (rough photo → clean/on-model shot) — **shipped** | 1 image | ~CHF 0.02–0.08 (GPU) | **CHF 1 / image**, pay-as-you-go, credits never expire; or from a plan bucket (Free 0, Maker 10, Studio 40, Atelier 150) | Real GPU cost, high relative to text, easy to run in bulk — the headline reason metering exists |
| AI translation (→ `nameEn`/`descriptionEn`, DE/FR/…) | 1 product | < CHF 0.001 | free within allowance, then **at cost** | So cheap it's free in the allowance; pure pass-through beyond it |
| AI description writing (photo/notes → copy) | 1 description | < CHF 0.005 | free within allowance, then **at cost** | Same — text is near-free |
| AI bulk/"scan my notebook" intake (photo → structured products) | 1 image parsed | ~CHF 0.005–0.02 (vision) | **at cost** | Vision model, clearly variable |
| Transactional email beyond free bucket | 1 email | ~CHF 0.0004 | first 500/mo free, then **at cost** | Provider bills per send; deliverability is a real cost |
| SMS / WhatsApp order notifications | 1 message | CHF 0.02–0.08 (carrier) | **at carrier cost** | Carrier fees are unavoidable and regional |
| Image storage beyond 5 GB | 1 GB-month | CHF 0.015 (R2) | **at cost** | Genuinely metered; 5 GB ≈ 2,000 photos free |

**How you pay:** prepaid credit packs or metered monthly billing on your card. Credits
**never expire**. **If our upstream cost drops** (cheaper image/text models ship
constantly), **your price should drop with it** — we commit to repricing down, not pocketing
the delta.

> **One honesty caveat on the shipped photo price.** The rest of §4 is literal pass-through
> (email, SMS, storage, text AI = free). **AI photo credits are the exception:** the shipped
> **CHF 1/image** sits *above* the ~CHF 0.02–0.08 GPU cost, so it carries margin — chosen as a
> simple, round anchor that's still ~1/100th of a photographer, and explicitly *"confirm it
> covers cost with healthy margin before launch"* in
> `phase1/marketing/ai-photography-pitch.md`. That means the pledge line *"passed straight
> through at what they cost us"* would be **false if applied to photo credits** — which is why
> the shipped `PRICING_PROMISE` bullet was reworded (v1.2) to promise *"pay-as-you-go, never
> padded into a monthly fee"* rather than *"at exactly our cost."* Open decision (§11): either
> reprice photo credits toward true cost, or keep CHF 1 and keep the wording honest about the
> margin. The code currently does the latter.

---

## 5. The price to take your data out

**Self-serve export: CHF 0. Always. No downgrade penalty, no "contact sales," no delay.**

Holding a maker's catalogue, customers, and order history hostage is the most common SaaS
dark pattern, and the exact thing this pricing reacts against.

| Way out | What you get | Our cost | **You pay** | Why |
|---|---|---|---|---|
| **One-click export** | Full CSV + JSON: products, images (zip), orders, customers, inventory | Cheap batch job | **CHF 0** | It's your data. Charging to leave is a ransom, not a price. |
| **Standing API / scheduled export** | Programmatic pull to mirror elsewhere continuously | Small compute + a maintained endpoint | **CHF 0, included** | Portability shouldn't need our permission |
| **White-glove migration to a competitor** (Shopify/Square/Woo) | *We* map fields, move images, stand up the import on the other side | **Real human hours** (~2–5 hrs) | **CHF 120 flat, one-time** — our cost of labour, not a lock-in toll | The only honest reason to charge here is that a person is doing work *for* you. Optional, never required — the free export already gets you 100% of your data. |

We charge for our **labour**, never for the **release** of your data. You can always leave
for CHF 0 and do the import yourself; the CHF 120 exists only for makers who'd rather we
carry the boxes.

---

## 6. The transaction-fee stance: we take 0%

The biggest honest lever, and now the shipped positioning ("your money goes straight into
your own Stripe account — Zolto never touches your money").

Zolto uses **Stripe Connect (Standard)**. A customer's payment lands **directly in your own
Stripe account.** Zolto's servers never touch it, never hold it, and take no application
fee. You pay **Stripe's** processing fee (≈2.9% + CHF 0.30 cards; TWINT and Tap-to-Pay are
cheaper) **directly to Stripe** — the same rate you'd get going to Stripe yourself.

- **SumUp / Worldline / Stripe-direct** monetize hardware and processing and hold your
  funds before payout.
- **Shopify** adds 0.5–2% on top unless you use Shopify Payments.
- **Zolto adds nothing.** Taxing revenue we never touch and did no work to earn is exactly
  the invisible fee this strategy refuses.

If we ever offer a revenue-share option, it will be **opt-in and in place of** the
subscription/usage fees (a choice for makers who prefer % over fixed), never stacked on top.

---

## 7. Subscriptions (standing commitments — the only place margin lives)

A subscription is for what costs us money *every month whether or not you use it today*: a
person on call, a domain + certificate + deliverability we keep alive, extra staff seats
(more support surface), an uptime promise. Recurring cost → recurring price. Each tier is a
**superset** (everything in Free, plus…). Names/prices match `shared/platform.ts`.

| Plan | Price (CHF, VAT per business plan §7.1) | What it adds beyond Free | Why it's a subscription |
|---|---|---|---|
| **Free** | **CHF 0/mo** | The entire §3 list — a complete, sellable store. Fair AI-text allowance. Community support. | Marginal cost ≈ 0 |
| **Maker** | **CHF 19/mo** *(highlighted)* | Custom domain + managed SSL, remove "runs on Zolto" badge, **10 AI photo credits/mo included**, priority email support (next-business-day), 3 staff seats | Domain/cert/deliverability + a real human answering email are *ongoing* costs |
| **Studio** | **CHF 49/mo** | Everything in Maker + up to 10 staff seats, advanced analytics, same-day human support, **40 AI photo credits/mo**, multi-currency | More support time + more seats = more standing cost |
| **Atelier** | **CHF 99/mo** | Everything in Studio + API access, SSO, audit logs, uptime SLA, **150 AI photo credits/mo** | SLA + security/compliance carry real recurring cost |

**Honesty guardrails baked into the subscription:**

- **No feature is behind the paywall that costs us nothing to run.** You never subscribe to
  *unlock* the checkout button, POS, inventory sync, or your catalogue size — those are
  free because they're cheap for us. You pay for domains, people, seats, SLAs.
- **Included buckets are a discount, not a lock-in.** Prefer to stay on Free and buy credits
  à la carte? Often cheaper, and we'll say so in-product.
- **Margin here is cost-recovery, not extraction.** The gap between CHF 19 and our ~CHF 5
  cost-to-serve is what keeps the support desk and the platform alive across *all* users,
  including the free ones we lose money on. Consistent with "we have enough — not here to
  make money off small people": the plan fee sustains the service, it doesn't mine it.
- **Grandfathering:** raise a plan price and existing subscribers keep their rate (roadmap
  §4.1). Changes are announced, never silent. Prorated, cancel any time, export on exit (§5).

### 7.1 Resolving the promise-vs-plans contradiction (✅ implemented)

The positioning originally shipped **two pricing philosophies at once** that fought each other:

- **`PRICING_PROMISE`** — pass-through, metered, "never charge for what isn't charged to us."
- **`PLANS`** — flat, feature-gated tiers copied from business-plan §3.1:
  *"Up to 50 products," "1 staff member," "10 AI descriptions / month," "Unlimited AI
  descriptions."*

Both halves of the old `PLANS` violated the pledge, in opposite directions — artificial caps
gated zero-cost features (manufactured scarcity), while "Unlimited AI" hid the real GPU cost
of AI photography. **Both are now fixed in code** (branch `claude/honest-pricing-plans`, off
`main`; `shared/platform.ts`, with tests + the Pricing page, llms briefs, and MCP updated):

| Was (pre-pledge) | Now (shipped) |
|---|---|
| Free: "Up to 50 products", "10 AI descriptions/month", "1 staff", "Basic POS" | Free: **unlimited products**, full POS (Tap to Pay/TWINT/cash), online store, real-time inventory sync, AI **text** (descriptions + translation, fair use), CSV/photo bulk upload, one-click data export |
| Maker: "Unlimited AI descriptions" | Maker: custom domain + SSL, badge removal, **10 AI photo credits/mo** (metered, not "unlimited"), human email support, 3 seats |
| Studio / Atelier: staff-count caps as the headline | Seats kept as a real support-surface cost; lead with support tier + domain + API/SSO/SLA. Photo buckets **40 / 150 per mo** |
| — (no add-on) | **`AI_PHOTO_CREDITS`**: CHF 1/image, pay-as-you-go, non-expiring; surfaced on Pricing + llms + MCP |

New `PlatformPlan.includedPhotoCredits` (Free 0, Maker 10, Studio 40, Atelier 150) makes the
buckets machine-readable. Regression tests guard it: the Free plan can't re-acquire the caps,
no plan may say "unlimited AI", and the credit buckets must be non-decreasing.

The plan cards and the pledge now say the same thing: **you pay for standing commitments and
pay-as-you-go usage, never for artificial limits** — with the single, disclosed exception of
photo-credit margin flagged in §4.

---

## 8. Worked example — what a real maker actually pays

Kalakosh-shaped tenant: ~60 sales/month, ~150-item catalogue, custom domain, translates the
catalogue to English once, generates AI copy for new items, and restyles ~20 product photos
with AI that month.

| Line item | Usage | **Cost to the maker** | **Cost to Zolto** | Net to Zolto |
|---|---|---|---|---|
| Core store + POS + inventory | all month | CHF 0 | ~CHF 2 (shared infra) | −2 |
| Sales processing | 60 sales | CHF 0 to Zolto (pays Stripe directly) | CHF 0 | 0 |
| Catalogue translation (one-off) | 150 items | CHF 0 (within allowance) | ~CHF 0.05 | −0.05 |
| AI descriptions for new items | ~20/mo | CHF 0 (within allowance) | ~CHF 0.10 | −0.10 |
| **AI product photography** | ~20 images | CHF 10 (10 from Maker's included bucket, 10 × CHF 1) | ~CHF 1.00 (GPU) | +9 |
| Order emails | ~120/mo | CHF 0 (under 500 free) | ~CHF 0.05 | −0.05 |
| Custom domain + SSL + support (Maker) | — | CHF 19 | ~CHF 3 (cert mgmt + support time) | +16 |
| **Monthly total** | | **~CHF 29** | **~CHF 6.25** | **~+CHF 23** |

A hobby maker on Free doing 15 sales/month pays **CHF 0** and costs us **~CHF 2** — and
that's fine: they're the funnel and the referral engine. A maker becomes a paying customer
**when their own usage or growth makes paying worth it to them** — the only durable kind.

---

## 9. Why this is still sustainable (honesty in both directions)

Honest pricing isn't charity pricing — but the margin is *legible* and it's cost-recovery,
not extraction:

- **Most usage runs at zero margin.** Email, SMS and storage pass the provider bill straight
  through; text AI we give away because metering it would cost more than the tokens. **AI
  photo credits are the one usage line with margin** (CHF 1/image over ~CHF 0.02–0.08 cost) —
  disclosed in §4, and still a small absolute number for the maker.
- **The subscription carries most of the margin**, and it buys the one thing that genuinely
  costs money at scale: **human support time.** CHF 19 − ~CHF 5 cost isn't profit skimmed off
  a small merchant; it's what keeps support answered and free-tier losses covered.
- **We lose ~CHF 2/mo on every free tenant** and treat it as CAC — cheaper than the business
  plan's CHF ~50 blended CAC, and the free tenant *is* the content/referral engine (§5).
- **We make nothing on your sales, on purpose** (§6). Our incentive is to keep you *using*
  the platform, not to tax your growth — aligning us with makers, not against them.

Blended, this still lands near the **CHF 35 ARPA** the business plan models (§7), composed
honestly: a floor of free users, usage revenue at cost, and subscription revenue mapped to
real support commitments.

---

## 10. The honesty guardrails (the promises this pricing makes)

1. **The meter is visible.** Every per-use charge shows unit cost and running total in-product.
2. **Usage is pass-through, not padding.** Email, SMS, storage and text AI are billed at cost (text AI is free within fair use); we never invent a fee for something that costs us nothing. The one disclosed exception is AI photo credits, which carry a margin above GPU cost (§4).
3. **Prices only ever move down with our costs.** Cheaper models/providers → cheaper for you.
4. **No charge for anything that costs us ~nothing.** Free stays free on principle, and there are no artificial product/AI caps.
5. **Leaving is free and one click.** Export is never gated, delayed, or priced (§5). We charge only for *our labour* if you ask us to migrate you.
6. **0% of your sales, forever, by architecture.** Stripe Connect Standard means we *can't* skim even if we wanted to (§6).
7. **Credits never expire** (as shipped). Refunds on exit are a proposed extra, not yet committed (§11).
8. **Price changes are announced and grandfathered**, never silent (§7).
9. **No AI-authored change to billing ships without a human merge** (business plan §1.3/§8.1) — pricing code is where a silent bug becomes a broken promise.

---

## 11. Open items (must resolve before launch)

- **VAT: inclusive vs exclusive** (business plan §7.1). Prices above are ex-VAT/TBD; EU B2C
  digital services → OSS at customer's local rate, CH VAT (8.1%) separate. Enable Stripe Tax;
  decide before the pricing page ships. (The shipped `Pricing.tsx` FAQ already defers tax to
  checkout — make sure that matches the decision.)
- **~~Reconcile `PLANS` with the pledge~~ (§7.1) — done** in `claude/honest-pricing-plans`.
  Remaining: get that branch reviewed and merged to `main`.
- **Validate the CHF 1/image photo-credit price** against real per-image GPU cost, then
  decide: reprice toward cost (literal pass-through) or keep CHF 1 with disclosed margin (§4).
  The `AI_PHOTO_CREDITS` code comment carries the same TODO.
- **Founder pricing** (§4.3): the CHF 9/mo founder rate is a temporary acquisition discount,
  not steady state; it rolls off and doesn't change the model.
- **Credit-pack accounting**: non-expiring credits are a standing liability (and refunds, if
  adopted, more so) — model before scaling usage billing.
- **Metering implementation**: usage billing needs a `usage_events` table + Stripe metered
  prices (extends roadmap §4.2). Ship with tests on the billing path.

---

> Prepared as a pricing-strategy companion to the Zolto business plan, reconciled with the
> shipped positioning. Spirit: charge for our real, variable cost — at what it costs us —
> never for lock-in, never for your data, never for a slice of sales we didn't earn.
