# Native TWINT — what it takes to get off Stripe's TWINT rail

> Research note answering the question left open in
> [`pricing-pivot-agent-commerce.md`](./pricing-pivot-agent-commerce.md) §3/§6:
> **owner decision is to move to native TWINT.** This document establishes what
> registration, approval and credentials that actually requires before any code
> is written.
>
> Written 2026-07-31. Status: **research complete.** The full API integration
> is blocked on TWINT (§0); a QR-sticker path that needs none of that is
> described in §4b and is the recommended first move.
> Everything below marked ✅ is verifiable from public sources (cited); ❓ marks
> what is genuinely not public and can only come from TWINT directly.

---

## 0. The headline: this is not a technical task first

**The TWINT API is not publicly available and is not handed out on request.**
TWINT's own developer FAQ states it plainly: TWINT can only be integrated via a
payment service provider or an existing plug-in, and anyone wanting to build a
direct integration must submit an application form which TWINT reviews before
they will talk to you.

Worse for Gwinn specifically:

> "If the connection/integration process is carried out technically by a third
> party (such as a payment service provider or an integrator), it must be
> **certified and approved by TWINT**. If this certification or approval is
> lost, the contractual partner may no longer process payments via TWINT."
> — TWINT GTC for Merchants (V4)

Gwinn is exactly that third party. We hold merchants' credentials and initiate
payments on their behalf, which makes us an **integrator** in TWINT's model, not
a merchant. So the sequence is:

1. Apply for direct integration (the online form; `sales@twint.ch` for
   questions).
2. Get certified/approved as an integrator.
3. *Then* receive the API specification and build.

**Step 1 is the next action and it is not a coding task.** Until TWINT responds,
the spec needed to write the client does not exist in our hands. Nothing below
should be read as "we can start implementing on Monday."

---

## 1. What each merchant needs (the answer to "what registration?")

Two separate things, and it's worth not conflating them:

| # | What | With whom | Produces |
|---|---|---|---|
| 1 | **Acquiring contract** — the "Payment Agreement", governed by the GTC for Merchants | **TWINT Acquiring AG** | The legal right to accept TWINT and receive payouts |
| 2 | **Store registration** in the TWINT merchant portal (*Händlerportal*) | TWINT | The **Store UUID** + the client **certificate** |

✅ Confirmed: the UUID is issued at the end of the registration flow — merchants
report receiving it by email and finding it under *Settings → \<store\>* in the
portal. The certificate is ordered/generated within that same portal.

This is per-merchant, not per-platform. Each Gwinn tenant selling via native
TWINT signs their own TWINT contract and registers their own store — exactly
like today's Stripe Connect model, where each tenant links their own Stripe
account and money never touches Gwinn. **That property is preserved**, which
matters: "Gwinn never holds your money" is a load-bearing promise
(`shared/platform.ts` `PRICING_PROMISE`).

---

## 2. What credentials we'd hold (the answer to "what keys or tokens?")

✅ Confirmed across four independent PSP/plugin integrations (mame/PrestaShop,
wallee, WooCommerce, Magento) — they all ask for the same three fields:

| Credential | Shape | Where it comes from |
|---|---|---|
| **Store UUID** | UUID string | TWINT merchant portal, *Settings → store* |
| **Client certificate** | `.p12` file (PKCS#12) | Generated/ordered in the merchant portal |
| **Certificate password** | string | **Set by the merchant** when the certificate is created in the portal — explicitly *not* their TWINT account password |

So: **no API key, no OAuth, no bearer token.** Authentication is a client
certificate — i.e. mutual TLS. That is a meaningfully different credential
shape from every other integration in this codebase, and it drives most of the
design consequences in §3.

❓ **Not public, must come from TWINT:** the API protocol (the ecosystem's
plugins are PHP/SOAP-shaped, which suggests SOAP over mTLS, but this is
inference, not fact), endpoint hostnames, test-vs-production certificate
handling, the sandbox story, and certificate expiry/rotation cadence. Do not
design against guesses here.

---

## 3. How it lands on this codebase

### 3.1 Credential storage — already solved

`server/tenantSecrets.ts` is the right and only home for these. It was built
for exactly this shape of problem: AES-256-GCM at rest under
`TENANT_SECRETS_KEY`, one row per `(tenant_id, provider)`, write-only from the
UI, no tRPC path that returns plaintext, every decrypt audit-logged. Storing
`twint_cert` (base64 of the `.p12`) and `twint_cert_password` there needs **no
new infrastructure** — `ciphertext` is `TEXT` (64 KB), comfortably more than a
`.p12` needs.

The Store UUID is not a secret and can sit on `tenants` as a plain column
alongside `stripe_connected_account_id`.

**One real gap:** the vault's write path assumes a pasted string. A `.p12` is a
binary file upload, so the admin UI needs a file input that base64-encodes
before it hits `putTenantSecret`. That is a small, contained change.

### 3.2 The POS flow barely moves

Today: `POST /api/pos/twint-intent` (`server/pos.ts:970`) creates and confirms a
`twint` PaymentIntent on the tenant's connected Stripe account and returns
Stripe's `next_action.redirect_to_url`, which the app renders as a QR code.

Native TWINT is the same *shape* — start a transaction, get back a token/QR,
poll or receive a callback for completion. The endpoint contract the POS app
consumes (`{ redirectUrl, paymentIntentId, posOrderId, totalRappen }`) can stay
almost identical, which means **the Android POS app may not need to change at
all**. What changes is the implementation behind it and the confirmation
mechanism (Stripe webhooks → TWINT's own polling/callback).

The `pos_orders.payment_method` enum already has `twint`; whether native and
Stripe TWINT need to be distinguishable for reconciliation is a real question —
recommend yes, as a separate column or an enum value, or a month of mixed
settlement becomes unattributable.

### 3.3 What must not regress

- **In-person carries no Gwinn fee, on any plan.** Native TWINT changes who the
  merchant pays 1.3% to; it must not become an excuse to introduce a Gwinn cut
  on POS. This is the central product promise.
- **Gwinn never holds merchant money.** Preserved: each merchant contracts with
  TWINT Acquiring AG directly.
- **Stripe TWINT stays as the fallback.** A merchant without a TWINT contract
  yet must still be able to take TWINT on day one. Two rails coexisting is the
  end state, not a migration.

---

## 4. The economics — weaker than the plan assumed

The original framing was "in-person is the cheapest rail" and native TWINT at
1.3% was the way to make that literally true.

✅ **Native TWINT is 1.3%**, confirmed on TWINT's own pricing: 1.30% for the QR
code sticker with no fixed, minimum, or recurring fee, and the same 1.30% for
distance/e-commerce transactions.

❓ **Stripe's TWINT rate is not publicly documented** — Stripe's Switzerland
local-payment-methods page is the authority and it is not scrapeable
(bot-protected; a human with a Stripe login should just read it). Stripe's
standard Swiss card rate is 2.9% + CHF 0.30, and Stripe markets TWINT as
carrying savings versus cards, so the true rate sits somewhere between 1.3% and
2.9% — but **the actual delta is unmeasured, and it is the entire business case
for this project.**

**Get that number before committing engineering time.** Concretely: read the
TWINT line on Stripe's CH pricing page, or take one real TWINT charge in the
live account and read the balance transaction's `fee_details`. If the delta
turns out to be ~0.3pp, the work does not pay for a second acquirer, a
certification process, per-tenant certificate lifecycle management, and a second
reconciliation path — and the honest move is to stay on Stripe TWINT and drop
the "cheapest rail" claim instead.

That is not an argument against the decision. It is the one measurement that
tells us whether the decision is worth what it costs, and it takes minutes
compared to the weeks that follow it.

---

## 4b. The shortcut: display the merchant's own QR sticker — ✅ SHIPPED

**This path needs no API, no certification and no application to TWINT.**
Built and merged; §5 below remains the (still-blocked) full integration.

What shipped: `tenant_settings.twint_qr_url` + an admin upload on the POS page
(`tenant.setTwintQr`, tenant-scoped through `storagePut` so it counts against
the plan's storage cap); `GET /api/pos/config` returns `twintQrUrl`, which is
what reveals the POS's **TWINT QR** button; `POST /api/pos/manual-sale` accepts
`paymentMethod: "twint_qr"` alongside `cash`, validated against an allow-list so
a client cannot claim a gateway-confirmed method on the attested path; the
Android app shows the sticker with the amount in 40sp beside it and records the
sale only when the merchant taps *Received CHF x.xx*. Migration `0013`.

The merchant already has a TWINT QR code sticker (they get one with the
acquiring contract; it's the *Kassensticker* small vendors use). Gwinn's POS
simply **shows that sticker on screen** for the customer to scan. Money goes
merchant → merchant at 1.3%, Stripe is out of the in-person loop entirely, and
Gwinn holds nothing but an image.

It also removes a wart in today's flow. `PaymentActivity.kt:364` records that a
locally-rendered QR of Stripe's redirect URL **was rejected by the TWINT app** —
only Stripe's hosted page carries a TWINT-native payload — so the POS currently
punts the customer into a Chrome Custom Tab. A real sticker is a genuine TWINT
payload, so it renders straight into the existing `imgQr` ImageView and the
cashier never leaves the app.

### The one thing it cannot do

**Gwinn cannot learn that the payment succeeded.** No API means no webhook, no
callback, nothing to poll. Basic-sticker payments are anonymous (no payer name
or number reaches the merchant), so even in principle there is no handle to
match against. The TWINT notification goes to the *merchant's* phone. No design
gets around this without the API in §0.

### Why that's acceptable: this is cash, and cash already works

`/api/pos/manual-sale` (`server/pos.ts:1093`) already records a sale as `paid`
the moment the cashier says so, with the comment *"Cash never touches Stripe —
the cashier takes the money, so this records the sale and decrements stock
immediately (no async confirmation to wait for)."* Sticker-TWINT is that exact
shape: the merchant is standing there watching their TWINT app, and attests.

**Design rule that keeps it honest:** do not reuse `payment_method: 'twint'` —
that value currently means *gateway-confirmed by Stripe*. Add a distinct
`twint_qr`. Merchant-attested and gateway-confirmed are different evidentiary
grades, and reconciliation has to be able to tell them apart. Trust ladder:

| Method | Evidence | Grade |
|---|---|---|
| `card`, `twint` (Stripe) | PaymentIntent succeeded | Gateway-confirmed |
| `twint_qr` *(new)* | Merchant saw it in their TWINT app | Attested |
| `cash` | Merchant counted it | Attested |

### The real risk is the amount, not the confirmation

✅ Confirmed: on a variable-amount sticker **the customer types the amount
themselves**. Cash doesn't have this failure mode — the merchant counts what
they're handed. A customer typing `5.00` instead of `50.00` produces a POS row
saying CHF 50 was collected when it wasn't.

Mitigations, in order of value:

1. Show the expected amount in **large type beside the QR** — the customer is
   copying a number off a screen, so make it unmissable.
2. Make the confirm button state the amount (*"Received CHF 47.00"*), so the
   merchant is attesting to a figure they just checked against their app, not
   tapping a bare "Done".
3. Let the merchant record a **different received amount**, producing a
   discrepancy row instead of a silent lie. Underpayment at a stall is a real
   event; the DB should be able to represent it.

Note: *QR stickers with payment information* (which can collect payer name /
purpose) cost **1.3% + CHF 0.30** and are variable-amount only — so they don't
solve the amount problem and they aren't free. Fixed-amount stickers exist but
a basket total varies, so they don't apply. TWINT's **Paylink / payment button**
can carry an amount and is worth a look, but generating one per sale plausibly
needs the portal or the API — unverified, do not design against it yet.

### Where "did it actually go through" gets proven

After the fact, not at the till. The TWINT Business Portal exports transactions;
matching those against attested `twint_qr` rows by amount and timestamp is what
turns an attestation into a verified payment, and surfaces the typo'd amounts.
That is the same shape as the existing `stripe_reconciliations` table and the
`pos_attributions` "which piece was that CHF 50 sale?" review queue — so it is a
pattern this codebase already has twice, not new machinery.

**Still to do on this rail:** the reconciliation import described above is *not*
built. Until it is, `twint_qr` rows are attestations that nothing ever checks —
which is the same standing cash has always had, but worth stating plainly rather
than assuming the row means the money arrived.

---

## 5. Recommended sequence (full API integration)

1. **Measure the delta** (§4). Minutes of work, decides everything after it.
2. **Submit the TWINT direct-integration application** (§0). Long lead time and
   nothing proceeds without it, so start it early even while step 1 runs.
3. **Get the API spec + sandbox** from TWINT once approved. Only now is the
   ❓ list in §2 answerable.
4. **Build**, in this order: `tenants.twint_store_uuid` column → `.p12` upload
   path into `tenantSecrets` → a `server/twint.ts` client mirroring
   `stripeConnect.ts`'s shape → swap the implementation behind
   `/api/pos/twint-intent` with the Stripe path kept as fallback →
   reconciliation split.
5. **Per `CLAUDE.md`, tests ship with each step**, and the payment path is
   explicitly called out there as highest-risk.

---

## 6. Open questions for TWINT

Worth sending with the application rather than discovering later:

- Does an integrator serving many merchants hold one platform-level
  certification plus per-merchant certificates, or does each merchant's
  certificate have to be provisioned by that merchant by hand? (This decides
  whether tenant onboarding is self-serve or a support ticket each time.)
- Is there a programmatic way to provision a store/certificate, or is the
  merchant portal the only path? (Same consequence.)
- Certificate lifetime and rotation — and is there an expiry notification, or
  do we have to track expiry ourselves and warn merchants before payments start
  failing at a market stall?
- Sandbox/test environment: separate certificates, separate endpoints?
- Refunds, partial refunds, and reversal semantics.

---

## Sources

- [TWINT — How do I, as a software developer, receive the TWINT API?](https://www.twint.ch/en/faq/how-do-i-as-a-software-developer-receive-the-twint-api/)
- [TWINT — Direct integration](https://www.twint.ch/en/business-customers/resources/direct-integration/)
- [TWINT — Integration in cash-register software and online shops (integrators)](https://www.twint.ch/en/business-customers/our-solutions/integrators/)
- [TWINT — GTC for Merchants V4](https://www.twint.ch/en/business-customers/twint-acquiring/gtc-merchant/)
- [TWINT — Payment Contract](https://www.twint.ch/en/business-customers/twint-acquiring/payment-contract/)
- [TWINT — Prices](https://www.twint.ch/en/business-customers/twint-acquiring/prices/)
- [TWINT — How much will TWINT cost me as a merchant?](https://www.twint.ch/en/faq/how-much-will-twint-cost-me-as-a-merchant/)
- [TWINT — QR code sticker](https://www.twint.ch/en/business-customers/our-solutions/qr-code-sticker/)
- [TWINT-AG/twint-woocommerce-extension — plugin guideline](https://github.com/Twint-AG/twint-woocommerce-extension/blob/latest/docs/twint-payment-plugin-guideline.md)
- [mame documentation — Setting up the TWINT integration](https://docs.mamedev.ch/setting-up-the-twint-integration/?lang=en)
- [wallee — TWINT processor documentation](https://app-wallee.com/en/doc/api/processor/documentation/1516366352092/twint)
- [Stripe — Accept TWINT payments](https://stripe.com/payment-method/twint)
- [Stripe — Local payment methods pricing (CH)](https://stripe.com/en-ch/pricing/local-payment-methods)
