# Bring your own payments — Zolto as a front end to the rails

> Research note answering the owner's question: **what if merchants brought
> their own payment provider — Stripe, Worldline, Payrexx, SumUp — and Zolto
> sold itself as a front end to those systems rather than competing with them,
> the way Shopify does?**
>
> Prompted by the August 2026 pricing review
> ([`positioning-pricing-revision.md`](./positioning-pricing-revision.md)),
> which established that Zolto's card row is the dearest in-person option on
> its own comparison table. Bring-your-own is the one move that makes that
> finding stop mattering, because the rate stops being Zolto's number.
>
> Written 2026-08-06. Status: **research, nothing committed.** Companion to
> [`swiss-stack-migration.md`](./swiss-stack-migration.md), which asks the
> narrower question of moving Zolto's *own* rail to Payrexx. Read that one
> first if you only read one — this note assumes its §3.
>
> ✅ = verifiable from this repository or a cited public source.
> ❓ = genuinely not public; only the provider can answer.

---

## 0. The headline

**The strategic core is right, and it is the best available answer to the
pricing review.** If the merchant brings the rail, "our card rate is the
highest on the page" becomes a fact about their provider rather than a fact
about Zolto. *"We don't set your rate — bring the best one you can get"* is a
stronger position than any table we could publish.

Three things decide how far it goes, and only one of them is hard:

1. **BYO-Stripe already works.** ✅ `providerMigration.ts` links the Stripe
   account a merchant already owns via Connect, and their checkout keeps
   working. Roughly a third of the idea is shipped.
2. **The 1% breaks on the others.** The platform fee is a Stripe Connect
   `application_fee_amount` (`checkoutSession.ts:340`). Payrexx has an
   equivalent; SumUp and Worldline, on current research, do not ❓. That is a
   pricing-model consequence, not an integration detail.
3. **In person is four SDKs in two native apps**, and is not worth it. The
   TWINT half of the argument survives BYO for free — see §4.

---

## 1. The Shopify analogy is misleading, and the correction matters

Shopify is **not** a bring-your-own business. Shopify Payments is the default
rail, and merchants who use a third-party gateway pay Shopify a **penalty fee
on top of** whatever the gateway charges. The commercially successful shape is
*"ours by default, yours at a cost"* — not *"yours, freely"*.

So the useful question is not "which four providers do we support". It is:

- **What is the house rail?** (§3 of `swiss-stack-migration.md` argues Payrexx.)
- **What does BYO cost the merchant?** (§5 here argues: Pro.)

A pure BYO platform with no house rail has no payment economics at all, which
for Zolto means the Free tier has no revenue mechanism — see §5.

---

## 2. What already exists

| Piece | State | Where |
|---|---|---|
| Catalogue import from Stripe (API, one click) | ✅ shipped | `providerMigration.ts` |
| Catalogue import from SumUp / Worldline (CSV, Swiss-format tolerant) | ✅ shipped | `providerMigration.ts`, `parseProviderCsv` |
| Linking a merchant's **existing** Stripe account | ✅ shipped | `stripeConnect.ts` |
| Platform fee on a merchant's own account | ✅ shipped, Stripe-only | `checkoutSession.ts:340` |
| Day-end reconciliation against the merchant's account | ✅ shipped, Stripe-only | `reconciliation.ts` (`runStripeReconciliationForTenant`) |
| Proof the platform fee actually landed | ✅ shipped, Stripe-only | `platformFeeVerify.ts` |
| Tap to Pay | ✅ shipped, Stripe Terminal only | `pos.ts` + `StripeTokenProvider.kt` + iOS twin |

**The honest summary of today: Zolto is already a front end to Stripe.** The
question is whether it becomes a front end to *four*, and that turns out to be
four different questions rather than one.

---

## 3. The seam

`createStorefrontCheckoutSession` (`checkoutSession.ts:168`) is already the
right boundary. It takes a tenant, a cart, a channel and a plan, computes
`platformFeeRappen`, and returns a `CreateCheckoutResult`. Nothing above it
knows what Stripe is.

A provider interface would be roughly:

```ts
interface PaymentProvider {
  id: "stripe" | "payrexx" | "sumup" | "worldline";
  /** Hosted checkout for an online order. Returns a URL to send the buyer to. */
  createCheckout(params: CheckoutParams): Promise<CreateCheckoutResult>;
  /** How the platform takes its cut — or that it can't. */
  platformFee: "at-source" | "invoice-only";
  /** Reads settled orders back for day-end reconciliation. */
  listSettled(tenant: Tenant, since: Date): Promise<SettledOrder[]>;
  /** Onboarding: link an existing merchant account, or create a sub-merchant. */
  connect: ConnectStrategy;
}
```

Four things sit outside that interface and each needs its own answer:

- **Webhooks.** Every provider has different event shapes and different
  guarantees. `server/routers/checkout.ts` and the Stripe webhook handler
  assume Stripe's semantics.
- **Refunds and partial refunds**, and who bears the platform commission on a
  reversal. Stripe's answer is not portable.
- **Payouts and currency** for EU-shipping orders.
- **`platformFeeVerify`.** Its whole job is asserting the fee landed. Under
  `invoice-only` providers there *is* no fee to observe, so the module's
  premise changes rather than its implementation.

---

## 4. In person: don't do it, and you don't need to

Tap to Pay is Stripe Terminal — `connectionTokens`, a per-tenant Terminal
Location provisioned on the Connect account (`pos.ts:815–908`), and
`StripeTokenProvider.kt` in the Android app with an iOS equivalent. Supporting
four providers means **four softPOS SDKs in two native apps**, each with its own
certification, its own hardware compatibility matrix and its own failure modes.

`swiss-stack-migration.md` §3.1 already calls this "the hard part" and §4 step 5
sequences it last, on evidence only, with the reasoning that *"no card reader,
your phone is the terminal" is the loudest product claim we make; it is the
worst possible thing to put on an unproven SDK.* That reasoning applies with
four times the force here.

**The good news, and it is genuinely surprising: the squeeze play survives BYO
untouched.** ✅ The `twint_qr` path (`pos.ts`, `ATTESTED_METHODS`) is the
merchant's *own* TWINT QR sticker — attested in the till, money never crossing
Zolto or any processor. It is already provider-independent. So
*"your catalogue and TWINT on the same screen"* — the one in-person argument
that survived the pricing review — holds no matter whose card rail sits beside
it, including SumUp's, which cannot take TWINT in its own till at all.

**Recommendation: one card rail in person, plus the merchant's own TWINT QR.
BYO is an online-checkout feature.**

---

## 5. The pricing consequence — the part that actually decides this

`REVENUE_SHARE.freeBps` is collected as a Stripe Connect `application_fee_amount`
on a direct charge. It settles itself, it is proven per transaction, and it is
the entire Free-tier business model
([`pricing-pivot-agent-commerce.md`](./pricing-pivot-agent-commerce.md) §2).

| Provider | Platform commission at source? | Consequence |
|---|---|---|
| **Stripe** | ✅ yes — `application_fee_amount`, shipped | No change. BYO-Stripe works today. |
| **Payrexx** | ✅ yes — Platform API split rules / commission | Works; confirm the basis excludes shipping ❓ (`swiss-stack-migration.md` §6.4) |
| **SumUp** | ❓ no partner-commission mechanism found | Invoice-only |
| **Worldline** | ❓ negotiated, per contract | Invoice-only, probably per-merchant |

**Invoicing the 1% is a different and worse business.** Zolto becomes a biller:
it has to compute what it is owed from data it does not hold authoritatively,
raise an invoice, reconcile payment, and chase non-payment — against merchants
whose defining characteristic is that they are very small. The failure mode is
not lost revenue, it is a collections process attached to a product whose pitch
is that it removes admin.

### The resolution: BYO requires Pro

If the fee can't be taken at source, sell a subscription instead.

- It is Shopify's structure (BYO costs something) without the punitive framing.
- It **self-selects honestly**: merchants who already have a payment provider
  have volume, and `PRO_BREAK_EVEN_ONLINE_CHF` is CHF 2,500/month online — above
  which Pro is *already* the cheaper plan. For most BYO candidates this is not a
  penalty, it is the plan they should be on anyway.
- It keeps the Free tier's promise exactly as written. Free stays "the house
  rail, and we take 1% only when the internet pays you". Nothing in
  `PRICING_PROMISE` needs rewriting.

One thing to hold to: **if BYO is gated to Pro, say so on the pricing page in
the same words as everything else.** The whole point of the August revision was
that a fee structure a merchant discovers later is worse than one that costs
more up front.

---

## 6. What it does to the positioning

### It helps, in three places

- **`ZOLTO_LIMITATIONS`** currently opens with *"taking a card through us is the
  dearest option on our own table"* and *"everything runs on Stripe, and Stripe
  sets the real price."* Under BYO both become far weaker complaints — the
  second nearly disappears.
- **The capability matrix's `who-holds-money` row** (*"nobody but you"*) gets
  stronger, not weaker.
- **`roadmap-backlog.md` §1** — migrate-in from Shopify/Square/Stripe/Worldline —
  stops being catalogue-only. *"Keep your Worldline contract, get a shop this
  weekend"* is a real wedge into the established-retailer segment the comparison
  pages currently concede outright.

### It costs, in two places

- **Activation.** Today Zolto onboards a merchant onto Connect in-flow and the
  pitch is "live this weekend". BYO *as the default* means "first, go have a
  relationship with a payment company" — the exact friction the product exists
  to remove, and the same kill criterion `swiss-stack-migration.md` §5 applies
  to Payrexx onboarding. **BYO as an option for merchants who already have a
  provider has the opposite effect**: it deletes a switching cost. The
  difference between default and option is the whole risk here.
- **Framing.** *"A front end to payment systems"* describes plumbing, not value,
  and it concedes the frame: if Zolto is a front end to SumUp, SumUp can add a
  catalogue and Zolto is a feature. Shopify survived that on scale and lock-in;
  a pre-launch Swiss company has neither yet.

**Recommended framing.** Keep *"removes the work"* as the position — the shop
built, written and photographed, one inventory across a stall and a website.
Use BYO to make the price question **moot** rather than making BYO the story.
The line is closer to *"whatever you already use to take cards, keep it"* than
to *"we are a payments front end"*.

---

## 7. Recommended sequence

1. **Settle the one question that decides the shape** (§8.1): do SumUp and
   Worldline expose *any* partner-commission mechanism? If yes, BYO can stay on
   Free and this is a much bigger idea. If no, §5's Pro gate is the design.
2. **Extract `PaymentProvider` behind `createStorefrontCheckoutSession`** with
   Stripe as the only implementation. Pure refactor, no behaviour change, and it
   is worth doing regardless because `swiss-stack-migration.md` §4 step 3 needs
   the same seam for Payrexx.
3. **Payrexx as the second implementation**, online only, one pilot tenant. It
   is the provider with a real commission API, and it closes two `moving` rows
   on a sovereignty ledger already published as promises.
4. **BYO-Stripe as an explicit product**, since it already works — the flow
   exists in `providerMigration.ts` and just isn't sold as a feature.
5. **SumUp / Worldline BYO last**, gated to Pro, and only if step 1 says the
   commission problem has an answer we can live with.
6. **In-person stays on one rail.** Revisit only if a Swiss softPOS SDK proves
   itself on real hardware.

---

## 8. Open questions

### 8.1 The one that decides everything

**Do SumUp and Worldline offer any partner/platform commission mechanism** that
lets an integrator take a percentage of a sub-merchant's transaction at source?
Every other question here is downstream of this one.

### 8.2 Per provider

| # | Question | Provider |
|---|---|---|
| 1 | Partner-commission API, or invoice-only? | SumUp, Worldline |
| 2 | Can commission be computed on the product subtotal **excluding shipping**, as `checkoutSession.ts` does today? | Payrexx, SumUp, Worldline |
| 3 | Is there a read API for settled transactions, for `reconciliation.ts`? | SumUp, Worldline, Payrexx |
| 4 | Who bears the commission on a refund or partial refund? | all |
| 5 | Sandbox with sub-merchants / test partner accounts? | all |
| 6 | Can a platform embed the softPOS SDK in **its own** apps? | Payrexx, SumUp, Worldline |
| 7 | Onboarding: API-driven, or a hosted form the merchant fills in? How long to first payment? | Payrexx, SumUp, Worldline |

### 8.3 Product questions, not provider questions

- If a merchant brings SumUp, they get catalogue + own-QR TWINT but **no in-app
  TWINT button**. Is that a supported configuration or a refused one? A till
  that silently loses a payment method is worse than one that says why.
- Does a BYO merchant still get day-end reconciliation? If the provider has no
  read API, the answer is no, and that is a feature they lose by choosing BYO —
  which belongs on the pricing page, not in a support ticket.

---

## 9. What would make this a bad idea

- **Step 1 comes back "invoice-only" for both**, and the Pro gate turns out to
  suppress adoption among exactly the merchants BYO was meant to attract.
- **The support surface quadruples before there are merchants to support it.**
  Four providers × onboarding × webhooks × refunds × payouts × chargebacks, for
  a company whose own comparison page concedes it has no track record. Sequence
  §7 exists to avoid paying this cost before the revenue.
- **BYO becomes the default rather than an option**, and the activation metric
  moves the wrong way (§6). This is the most likely way to get it wrong, because
  it happens through drift rather than decision.

---

## Sources

- This repository: `server/checkoutSession.ts`, `server/stripeConnect.ts`,
  `server/providerMigration.ts`, `server/pos.ts`, `server/reconciliation.ts`,
  `server/platformFeeVerify.ts`,
  `android/app/src/main/java/ch/zolto/pos/data/StripeTokenProvider.kt`
- [`swiss-stack-migration.md`](./swiss-stack-migration.md) §3 — Payrexx's
  platform API, rates and open questions
- [`pricing-pivot-agent-commerce.md`](./pricing-pivot-agent-commerce.md) §2 —
  why the skim is the Free-tier model
- [`positioning-pricing-revision.md`](./positioning-pricing-revision.md) §1 —
  the card-rate finding this note is a response to
- [`roadmap-backlog.md`](./roadmap-backlog.md) §1 — migrate-in, already captured
- [Shopify — Payment provider fees](https://help.shopify.com/en/manual/payments/third-party-providers)
  (third-party gateway fees on top of the gateway's own charge)
