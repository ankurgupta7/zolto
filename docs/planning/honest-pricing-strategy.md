# Zolto — Honest Pricing Strategy

> Companion to `./zolto-business-plan.md` (§4) and `./monetization-code-roadmap.md`.
> This document refines the "four flat tiers" sketch in the business plan into a
> **cost-honest** model: we charge where our cost is real and variable, we keep the
> commerce engine free, we take **0% of your sales**, and we never charge you to leave.
> Document version: 1.0

---

## 1. The one principle

**We charge you where serving you actually costs us money, and nowhere else.**

That single rule decides everything below:

- If a feature costs us ~nothing at the margin (one more product row, one more POS
  sale, one more page view) → **it's free**, forever. Gating it would be a toll booth
  on a road that's already paid for.
- If an action has a **real, external, per-use cost** (an AI token, an email, a text
  message, a gigabyte) → **you pay per use, at our cost plus a slim, disclosed markup.**
  You can see the meter.
- If we're holding a **standing commitment open for you** (a real person answering your
  questions, a domain + certificate + deliverability we keep alive, extra staff seats,
  an uptime promise) → **that's a subscription**, because it's a recurring cost to us.
- **Leaving is free.** Your catalogue, customers, and orders are yours. We will never
  put a price, a delay, or a dark pattern between you and your own data.
- **We take 0% of your sales.** Your money goes straight into your own Stripe account
  (Stripe Connect Standard — see §6). We are not in the middle of your revenue.

Everything that follows is just this principle applied line by line, with the numbers shown.

---

## 2. Why this is different from the incumbents

| | Shopify / Square / WJewel | **Zolto** |
|---|---|---|
| Base fee | Flat monthly, whether you sell or not | Free core; you pay only for variable-cost extras |
| Cut of your sales | Square/Shopify take a % unless you use *their* processor | **0%** — Stripe Connect Standard, money is never ours |
| AI features | Bundled into a higher tier you're forced to buy | Metered per use, at cost — pay for what you run |
| Your data on exit | Export exists but you're nudged to stay | **Free full export, one click, any time** |
| What you're really paying for | Bundling and lock-in | Our actual marginal cost + honest margin |

The wedge in the business plan is *maker-first design + POS/online parity*. The pricing
wedge is *honesty*: a maker doing 40 sales a month should pay us almost nothing, because
they cost us almost nothing.

---

## 3. Free forever (marginal cost ≈ €0)

These are free because one more of them costs Zolto essentially nothing. Our infra for
these is a shared MySQL row, a Cloudflare R2 object (storage ~€0.015/GB-month, **zero
egress fees**), and CPU we're already paying for. Charging here would be charging for air.

| Feature | Why it's free (our cost) | Cost to you |
|---|---|---|
| Online storefront (1 store) | A subdomain + shared app server; marginal cost ≈ €0 | €0 |
| Product catalogue — **unlimited items** | One DB row each; ~€0 to store | €0 |
| Product images (fair-use storage, see §4) | R2 storage ~€0.015/GB-mo, no egress | €0 up to 5 GB |
| Cart + Stripe Checkout (cards + TWINT) | Stripe does the work; we just build the session | €0 from us (you pay Stripe directly) |
| **POS — Tap to Pay, cash, TWINT QR** | Terminal session cost is Stripe's, not ours | €0 from us |
| Real-time inventory sync (POS ↔ online) | A DB write; the whole point of the product | €0 |
| Order management, receipts, refunds | Standard app logic | €0 |
| 1 staff/admin login | One auth row | €0 |
| Basic analytics (sales, top products, channel split) | Aggregate queries on your own data | €0 |
| Discord/Slack/WhatsApp "photo → draft product" intake | The *intake* is free; the AI step that writes it is metered (§4) | €0 (AI usage billed separately) |
| **Full data export** (CSV/JSON + image bundle) | Cheap to generate; morally not ours to charge for | €0 (see §5) |
| `llms.txt` + storefront SEO/AI discoverability | Generated text; helps you get found | €0 |

**Design note:** the free tier is not a crippled demo. It is a *complete, sellable store*.
A maker can run their entire business on €0/month and we are still glad to have them —
they cost us cents, they generate the content and word-of-mouth in the business plan
(§5), and they upgrade *when their own usage makes it worth it*, not because we walled off
the checkout button.

---

## 4. Pay-per-use (real variable cost — you can watch the meter)

Everything here has a cost that scales with usage and that we pay to someone else
(an LLM API, an email/SMS provider, a storage bill). So you pay per use. **We publish our
unit cost and our markup.** The markup exists to cover billing overhead and price
volatility, not to hide a margin — it's small and stated.

Our LLM runs on Groq `llama3-8b` today (roughly €0.05–0.10 per **million** tokens), so a
single product's worth of AI is a *fraction of a cent*. We round to human-legible prices
and pool tiny costs into credit packs so you're not billed €0.0007 line items.

| Feature | What one unit is | Our real cost / unit | **We charge** | Why per-use (not free / not subscription) |
|---|---|---|---|---|
| **AI translation** (e.g. → English `nameEn`/`descriptionEn`) | 1 product translated | < €0.001 (LLM tokens) | **€0.01 / product**, or free with a Studio plan bucket | Real external API cost, scales with catalogue size, bursty (you translate 200 items once, then rarely) |
| **AI description writing** (photo/notes → listing copy) | 1 description generated | < €0.005 | **€0.02 / description** | Same: pure LLM cost, on-demand |
| **AI bulk upload / vision** (photo → structured product) | 1 image parsed | ~€0.005–0.02 (vision model) | **€0.03 / item** | Higher-cost model, clearly variable |
| **Transactional email** beyond free bucket | 1 email sent | ~€0.0004 | **first 500/mo free, then €0.50 / 1,000** | Provider bills per send; deliverability is a real cost |
| **SMS / WhatsApp order notifications** | 1 message | €0.02–0.08 (carrier) | **at carrier cost + 10%** | Carrier fees are unavoidable and regional |
| **Extra image storage** beyond 5 GB | 1 GB-month | €0.015 (R2) | **€0.05 / GB-month** | Storage is genuinely metered; 5 GB covers ~2,000 photos free |
| **One-time full-catalogue AI translation run** | whole catalogue | sum of per-item | **€0.01/item, capped at €9** | Convenience "do it all" button; capped so a 5,000-item shop isn't punished |

**How you pay:** prepaid credit packs (e.g. **€5 = 500 AI credits**) or metered monthly
billing settled through your card. Credits **never expire** and are **refundable on exit**
— an honest meter doesn't pocket your unused balance. If our upstream cost drops (cheaper
models ship constantly), **your price drops too**; we commit to repricing down, not
pocketing the delta.

---

## 5. The price to take your data out

**Self-serve export: €0. Always. No downgrade penalty, no "contact sales," no delay.**

Holding a maker's catalogue, customers, and order history hostage is the single most
common SaaS dark pattern, and it is exactly the thing this pricing is a reaction against.
So:

| Way out | What you get | Our cost | **We charge** | Why |
|---|---|---|---|---|
| **One-click export** | Full CSV + JSON dump: products, images (zip), orders, customers, inventory | Cheap batch job | **€0** | It's your data. Charging to leave is a ransom, not a price. |
| **Standing API / scheduled export** | Programmatic pull so you can mirror to another system continuously | Small compute + a maintained endpoint | **€0 self-serve; included** | Portability shouldn't require our permission |
| **White-glove migration to a competitor** (Shopify/Square/WooCommerce) | *We* do the hands-on work: map fields, move images, stand up the import on the other side | **Real human hours** (~2–5 hrs) | **€120 flat, one-time** — our cost of labour, not a lock-in toll | The *only* honest reason to charge here is that a person is doing work *for* you. Priced at cost, optional, and never required — the free export already gets you 100% of your data. |

The distinction is the whole point: **we charge for our labour, never for the release of
your data.** You can always leave for €0 and do the import yourself; the €120 only exists
for makers who'd rather we carry the boxes.

---

## 6. The transaction-fee stance: we take 0%

This is worth its own section because it's the biggest honest lever we have.

Zolto uses **Stripe Connect (Standard)**. When a customer buys from your store, the money
goes **directly into your own Stripe account**. Zolto's servers never touch it, never hold
it, and take no application fee. You pay **Stripe's** processing fee (≈2.9% + €0.30 for
cards; TWINT and Tap-to-Pay are cheaper) **directly to Stripe** — the same rate you'd get
going to Stripe yourself.

- **Shopify** charges an *extra* 0.5–2% on top unless you use Shopify Payments.
- **Square** bakes its cut into every swipe.
- **Zolto adds nothing.** Taking a slice of revenue we never touch and did no work to earn
  would be exactly the kind of invisible tax this strategy refuses.

If we ever *do* introduce a revenue-share option, it will be **opt-in and in place of**
subscription/usage fees (a choice for makers who prefer % over fixed), never stacked on top.

---

## 7. Subscriptions (standing commitments — recurring cost to us)

Subscriptions are for things that cost us money *every month whether or not you use them
today*: a person on call, a domain + certificate + deliverability we keep alive, extra
seats, an uptime promise. Recurring cost → recurring price. Each tier is a **superset**
(everything in Free, plus…), and each line says why it can't just be free or metered.

| Plan | Price (indicative, VAT handling per business plan §7.1) | What it adds | Why subscription |
|---|---|---|---|
| **Free** | **€0/mo** | The entire §3 list. A complete, sellable store. | Marginal cost ≈ €0 |
| **Studio** | **€19/mo** | Custom domain + managed SSL, remove "runs on Zolto" badge, **500 AI credits/mo included**, 500→5,000 email/mo, 3 staff seats, email support (next-business-day) | Domain/cert/deliverability + support are *ongoing* costs; included AI bucket saves metered-heavy users money |
| **Atelier** | **€49/mo** | Everything in Studio + up to 10 staff seats, advanced analytics, priority support (same-day human), **2,000 AI credits/mo**, higher storage/email buckets, multi-currency | More human support time + more seats = more standing cost |
| **Enterprise** | **from €149/mo** (quoted) | SSO/SAML, audit logs, API access, uptime SLA, named contact, custom AI limits | SLA + security features carry real compliance/support cost |

**Honesty guardrails baked into the subscription:**

- **No feature is behind the paywall that costs us nothing to run.** You never pay a
  subscription to *unlock* the checkout button, POS, or inventory sync — those are free
  because they're cheap for us. You pay for domains, people, seats, SLAs — things with a
  real recurring cost.
- **Included AI credits are a discount, not a lock-in.** If you'd rather stay on Free and
  buy credits à la carte, that's often cheaper and we'll say so in-product.
- **Grandfathering:** if we raise a plan price, existing subscribers keep their rate
  (business plan §4 / roadmap §4.1). Price changes are announced, never silent.
- **Prorated, cancel any time, export on the way out (§5).** No annual lock-in required.

---

## 8. Worked example — what a real maker actually pays

Kalakosh-shaped tenant: ~60 sales/month, ~150-item catalogue, one custom domain, translates
the catalogue to English once, generates AI descriptions for new items.

| Line item | Usage | **Cost to the maker** | **Cost to Zolto** | Zolto margin |
|---|---|---|---|---|
| Core store + POS + inventory | all month | €0 | ~€2 (shared infra) | −€2 |
| Sales processing | 60 sales | €0 to Zolto (pays Stripe directly) | €0 | €0 |
| One-time catalogue translation | 150 items | €1.50 (or 0 on Studio) | ~€0.05 | +€1.45 |
| AI descriptions for new items | ~20/mo | €0.40 | ~€0.10 | +€0.30 |
| Order emails | ~120/mo | €0 (under 500 free) | ~€0.05 | −€0.05 |
| Custom domain + SSL + support | — | €19 (Studio) | ~€3 (cert mgmt + support time) | +€16 |
| **Monthly total** | | **~€19.40** | **~€5.25** | **~€14** |

A hobby maker on Free doing 15 sales/month pays **€0** and costs us **~€2** — and we're
fine with that; they're the top of the funnel in the business plan (§5) and a future
Studio upgrade. A maker only becomes a paying customer **when their own usage makes paying
worth it to them**, which is the only durable kind of paying customer.

---

## 9. Why this is still a real business (margin honesty, both directions)

Honest pricing is not charity pricing. The margins are real, just *legible*:

- **Usage features** carry a high *percentage* markup on a tiny *absolute* cost (€0.01 on a
  €0.001 cost). That's fine and disclosed — it covers billing/Stripe fees on micro-charges
  and price volatility. The maker still pays cents.
- **Subscriptions** carry the real margin (€19 price vs ~€5 cost), and that margin buys the
  one thing that genuinely costs us money at scale: **human support time**. We're honest
  that this is what you're paying for.
- **We lose a little on every free tenant** (~€2/mo) and treat it as CAC — cheaper than the
  business plan's €50 blended CAC, and the free tenant *is* the content/referral engine.
- **We make nothing on your sales**, on purpose. Our incentive is to keep you *using the
  platform*, not to tax your growth — which aligns us with makers instead of against them.

Blended, this lands in the same **€35 ARPA** neighbourhood the business plan models (§7),
but composed honestly: a floor of free users, usage revenue that scales with real cost, and
subscription revenue that maps to real support commitments.

---

## 10. The honesty guardrails (the promises this pricing makes)

1. **The meter is visible.** Every per-use charge shows unit cost and running total in-product.
2. **Prices only ever move down with our costs.** If Groq/R2/email get cheaper, you get cheaper. We won't quietly keep the delta.
3. **No charge for anything that costs us ~nothing.** Free stays free on principle, not as a trial.
4. **Leaving is free and one click.** Data export is never gated, delayed, or priced (§5). We only charge for *our labour* if you ask us to do the migration *for* you.
5. **0% of your sales, forever, by architecture.** Stripe Connect Standard means we *can't* skim even if we wanted to (§6).
6. **Unused credits are refundable.** An honest meter gives the money back.
7. **Price changes are announced and grandfathered**, never silent (§7).
8. **No AI-authored change to billing ships without a human merge** (business plan §1.3/§8.1) — our pricing code is exactly the surface where a silent bug becomes a broken promise.

---

## 11. Open items (carried from the business plan, must resolve before launch)

- **VAT: inclusive vs exclusive** (business plan §7.1). All prices above are shown
  ex-VAT/TBD; EU B2C digital services → OSS at customer's local rate, CH VAT (8.1%) is
  separate. Enable Stripe Tax; decide inclusive vs exclusive before the pricing page ships.
- **Founder pricing** (§4.3): the €9/mo founder rate is a temporary acquisition discount,
  not a steady-state price, and rolls off — it does not change the model above.
- **Credit-pack accounting**: unused/refundable credits are a liability; model it before scaling usage billing.
- **Metering implementation**: usage billing needs a `usage_events` table + Stripe metered
  prices (extends roadmap §4.2 add-on system). Ship with tests on the billing path.

---

> Prepared as a pricing-strategy companion to the Zolto business plan.
> Spirit: charge for our real, variable cost — never for lock-in, never for your data,
> never for a slice of sales we didn't earn.
