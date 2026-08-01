# An all-Swiss stack — what it costs, what it breaks, what it's worth

> Research note answering the owner's question: **if Zolto had to run on Swiss
> infrastructure and a Swiss payment processor, what would we use, and what is
> the relatively most cost-effective way to do it?**
>
> Prompted by the sub-processor caveat shipped with the European data-residency
> band (`DATA_RESIDENCY` in `shared/platform.ts`): hosting in Europe is not the
> same as nothing leaving Europe, and the honest footnote names Stripe, a model
> provider and an email service. This document asks what removing those would
> actually take.
>
> Written 2026-08-01. Status: **research complete, nothing committed.**
> Everything marked ✅ is verifiable from public sources (cited at the end) or
> from this repository; ❓ marks what is genuinely not public and can only come
> from the provider directly.

---

## 0. The headline: four of the five pieces are a weekend, and payments is the project

Servers, object storage, the LLM and transactional email can all be moved to
Swiss providers for roughly **CHF 10–30/month more than today**, with almost no
code change — two of them are already provider-agnostic in this codebase.

Payments is the entire cost, the entire risk, and the only piece with a
marketing consequence. Stripe is doing four separate jobs here, and one of them
lives inside two native apps.

There is exactly one Swiss provider that plays the role Stripe Connect plays for
us: **Payrexx** (Thun) — a regulated Swiss payment facilitator with a platform
API for sub-merchant onboarding and split payments. ✅

Two findings that change the shape of the decision:

1. **Payrexx is cheaper per transaction than Stripe**, not more expensive
   (§3.3). A sovereignty migration that *reduces* what makers pay is a
   different proposition from one that taxes them for a flag.
2. **Payrexx supplies TWINT without integrator certification.** That is the
   blocker [`native-twint-integration.md`](./native-twint-integration.md) §0 is
   stuck behind — TWINT will not hand out its API until Zolto is certified as an
   integrator. Going through a Swiss facilitator gets TWINT at a known rate with
   no application, no certification, and no per-tenant certificate lifecycle to
   manage. **This note is therefore also a possible answer to that one.**

---

## 1. Scope: what "Swiss" can and cannot mean

| Layer | Can be Swiss | Notes |
|---|---|---|
| Application servers | ✅ yes | Infomaniak, Exoscale, Flow Swiss, nine.ch |
| Database (merchant catalogue, orders, customers) | ✅ yes | Same machines, or Exoscale DBaaS |
| Product photos (object storage) | ✅ yes | S3-compatible, Swiss zones |
| LLM (descriptions, chat, notebook parsing) | ✅ yes | Infomaniak AI, Swiss-hosted open models |
| AI image generation | ⚠️ yes, at a quality cost | §2.4 — the real risk in this whole plan |
| Transactional email | ⚠️ yes, awkwardly | §2.5 — no Swiss Resend equivalent found ❓ |
| Payment processing | ✅ yes | Payrexx; §3 |
| TWINT / PostFinance Pay | ✅ already Swiss | The genuinely Swiss rails |
| Card schemes (Visa/Mastercard) | ❌ no | Not a Swiss option at any price |
| Apple Pay / Google Pay wallets | ❌ no | US wallets riding Swiss acquiring |

**Consequence for copy:** "everything Swiss" is not a claim we could make
truthfully even after all this work. "Swiss-hosted, Swiss-processed, and TWINT
first" is, and it is the stronger claim anyway because it is checkable.

---

## 2. The easy four

### 2.1 Hosting — Infomaniak (recommended) or Exoscale

✅ **Infomaniak** (Geneva, employee-owned, Swiss-hosted, no introductory
pricing): VPS Lite at 2 vCPU / 4 GB / 60 GB ≈ **CHF 7.20/month**, against the
Hetzner CX22 (~€4/month) named in [`SELF_HOSTING.md`](../../SELF_HOSTING.md).
For a stack that is one app container plus one MySQL container, this is the
whole delta.

✅ **Exoscale** (Lausanne, ISO 27001, CH-GVA / CH-DK zones) is the option if we
outgrow a single VPS: instances from ~CHF 0.0073/hour, managed MySQL from
~€42/month, S3-compatible object storage in the same zones. More expensive, but
it removes the "who runs the database" question.

**Effort: near zero.** `docker-compose.yml` moves as-is — Caddy, the app and
MySQL do not care whose hardware they are on. The work is DNS, a data migration
and a maintenance window.

### 2.2 Object storage — Infomaniak Public Cloud or Exoscale SOS

Both are S3-compatible. ✅ **`server/storage.ts` already takes `S3_ENDPOINT`,
`S3_REGION` and a custom public URL**, precisely so it can point at R2, B2 or
MinIO. Pointing it at a Swiss zone is an env change plus a bucket copy.

**Effort: zero code.**

### 2.3 LLM — Infomaniak AI Tools

✅ Infomaniak runs open models (Llama, Mistral, Mixtral class) on Swiss
infrastructure with an **OpenAI-compatible API**, billed per use, and states
that requests are not stored or logged.

✅ **`server/_core/llm.ts` already reads `LLM_BASE_URL` and `LLM_API_KEY`** and
speaks the OpenAI chat-completions shape — `llm.test.ts:309` pins exactly this
behaviour. Switching the text-side AI to a Swiss provider is, as far as this
codebase is concerned, **an environment variable**.

❓ Per-token pricing was not obtainable (the pricing page is bot-protected).
Infomaniak describes it as per-use and cheaper than the market references;
confirm with a real account before sizing.

**Quality note:** descriptions, translations and the support chat are the
forgiving end of the AI work. Notebook OCR (`notebook-inventory`) is the
demanding end and should be re-tested, not assumed.

### 2.4 AI product photography — the real risk, not the real cost

✅ Infomaniak generates images (SDXL-class) at ~CHF 0.02/image, so the cost side
is trivially fine.

The problem is that **"one phone photo → a sellable product shot" is the feature
that removes the photographer**, and it is carried by the before/after images in
the Launch Diary and the case study. Today it runs through
`server/_core/imageGeneration.ts` against `BUILT_IN_FORGE_API_URL`. An
SDXL-class open model is not obviously able to hold that quality bar.

**This is the one piece to test before deciding anything.** Re-run the existing
`/launch/*-raw.jpg` inputs through the Swiss model and compare against the
shipped `-styled.jpg` outputs by eye. If the result is visibly worse, the honest
options are: keep this one call foreign and disclose it, or drop the on-model
claim. A Swiss flag does not sell a necklace that photographs worse.

### 2.5 Transactional email — no clean Swiss answer ❓

No Swiss equivalent of Resend/Postmark surfaced in the research. The realistic
options:

- **Infomaniak's mail service / SMTP relay** — Swiss, but built for mailboxes
  rather than transactional APIs.
- **Postfix on our own Swiss VPS** — free and fully sovereign; we then own
  deliverability, SPF/DKIM/DMARC and reputation, which is a real ongoing cost.
- **Mailpro (Geneva)** and similar Swiss senders — closer to newsletter tooling.

✅ `server/_core/email.ts` is a single adapter, so the code side is small either
way. Note that magic-link and receipt email failures are silent today
(`RESEND_API_KEY` blank → skipped), so a deliverability regression here would be
quiet. Whatever replaces it needs a delivery check that fails loudly.

---

## 3. Payments — the whole project

### 3.1 What Stripe actually does for us, file by file

| # | Job | Where it lives | Replaceable? |
|---|---|---|---|
| 1 | Merchant onboarding + KYC (Connect accounts) | `server/stripeConnect.ts` | ✅ Payrexx sub-merchant onboarding |
| 2 | **Direct charges + `application_fee_amount` — the 1% business model** | `server/checkoutSession.ts:333`, `server/routers/checkout.ts` | ✅ Payrexx split payments / platform commission |
| 3 | **Tap to Pay via the Stripe Terminal SDK** | `server/pos.ts:784–880` + `android/app/src/main/java/ch/zolto/pos/data/StripeTokenProvider.kt` and the iOS app | ⚠️ SoftPOS SDK swap — the hard part |
| 4 | Zolto's own Pro subscription (CHF 25/mo) | `server/billing.ts` | ✅ Payrexx subscriptions — but see §3.5 |

Also touched, and easy to forget: `server/reconciliation.ts` reads the tenant's
own account via `{ stripeAccount }` for the day-end reconciliation email, and
`server/platformFeeVerify.ts` exists specifically to prove the application fee
lands. Both are payment-provider-shaped, not Stripe-shaped, but both need a
counterpart.

### 3.2 What Payrexx covers

✅ Payrexx is a **regulated Swiss payment facilitator** — not a gateway — so it
holds the acquiring relationship and we do not need our own licence or to hold
funds. Its **Platform API** lets a platform operator configure split rules,
commissions and payout cycles, and it runs automated sub-merchant KYC
(ID check, commercial-register comparison, beneficial-owner determination).

✅ Methods: TWINT, PostFinance Pay, Visa/Mastercard, Apple Pay, Google Pay,
QR-bill. ✅ Tap to Pay: Payrexx offers SoftPOS built with Ingenico, no hardware,
no setup fee, 30-day trial. ✅ Apple opened Tap to Pay on iPhone in Switzerland
in March 2025, and Worldline and Nexi both offer it too, so the *capability* is
not in doubt — only which SDK we'd be building against.

That maps onto jobs 1, 2 and 4 cleanly, and 3 in principle.

### 3.3 The economics — this migration makes makers *cheaper*, not dearer

| | Stripe (CH) | Payrexx |
|---|---|---|
| Visa / Mastercard, domestic | ✅ 2.9% + CHF 0.30 | ✅ ~1.65% + CHF 0.18 |
| TWINT | ❓ not publicly documented | ✅ ~1.25–1.3% + CHF 0.18 |
| Setup / monthly minimum | none | ✅ none on entry plans |
| Above ~CHF 100k/month volume | standard rates | ❓ individually negotiated |

Worked example on the **CHF 65 freshwater pearl necklace** from the case study
(`launchContent.ts` diary #2 — a real order, not a made-up basket):

- Stripe, card: 65 × 2.9% + 0.30 = **CHF 2.19**
- Payrexx, card: 65 × 1.65% + 0.18 = **CHF 1.25**
- Payrexx, TWINT: 65 × 1.3% + 0.18 = **CHF 1.03**

At the pilot maker's ~12 online orders/month that is small in absolute terms —
but it is roughly **halving** the payment cost, and it is a claim that belongs
next to the 1% platform fee rather than buried. It also answers
`native-twint-integration.md` §4's open question from the other direction: we
would get the 1.3% TWINT rate **without** becoming a certified TWINT integrator.

❓ The exact TWINT figure appeared as both 1.25% and 1.3% in Payrexx's own
material; confirm which applies to a platform sub-merchant.

### 3.4 What it does to the marketing surface

This is not cosmetic. Under a facilitator model, merchants are **sub-merchants
of Payrexx**, not holders of their own Stripe account. Zolto still never touches
the money — but the current copy says something more specific than that, in at
least five places sourced from `shared/platform.ts`:

- `FEATURES` → `payments`: *"Connect your own Stripe account; your customers pay
  straight into it."*
- `INCUMBENT_COMPARISON` → *"Straight into your own Stripe"*
- `COST_COMPARISON.usNote` → *"your Stripe, your money"*
- `COMPETITORS` → the Stripe entry explains we settle through Stripe Connect
- The llms.txt / MCP briefs repeat all of it to agents

All of that becomes "your own Payrexx merchant account, paid out to your bank",
which is honest and still strong — but it is a rewrite with tests attached, not
a find-and-replace. **Budget it as part of the payments work, not after it.**

The upside: `DATA_RESIDENCY` was deliberately built as one constant read by the
landing band, the footer, the FAQ, the privacy policy, the llms briefs and the
MCP tool. Turning "Europe, mostly Germany" into "Switzerland" is a one-file
edit, and the sub-processor caveat shrinks to the parts that are genuinely still
foreign (card schemes, wallets, possibly image generation).

### 3.5 What I would *not* move

**Zolto's own Pro subscription billing.** That is our company's card being
charged, not merchant or customer data, and no marketing claim depends on where
it runs. Keeping `server/billing.ts` on Stripe while storefront payments move to
Payrexx costs nothing in credibility and removes a whole workstream from the
critical path.

---

## 4. Recommended sequence

Deliberately ordered so the cheap, reversible wins land first and the native-app
surgery lands last.

1. **Measure the two things that can kill it** (days, no commitment):
   - Run the Launch Diary's raw photos through Infomaniak's image model and
     compare by eye (§2.4).
   - Get Payrexx's platform terms in writing: sub-merchant onboarding UX, the
     TWINT rate for sub-merchants, payout timing, and whether their SoftPOS SDK
     is available to a platform integrating it into its *own* app (§6).
2. **Move hosting, storage and the LLM** (a weekend). Cheap, reversible, and it
   upgrades the residency claim from "Europe" to "Switzerland" immediately.
3. **Put a provider interface behind `checkoutSession.ts`** and run Payrexx for
   **online checkout only**, on one pilot tenant. Online is where the 1% lives,
   so it is the piece worth proving, and it does not touch the POS apps.
4. **Rewrite the payment copy** (§3.4) in the same change that flips the first
   tenant — the site must never describe a rail we no longer run.
5. **Native Tap to Pay last, and only on evidence.** Keep Stripe Terminal in the
   POS apps until a Swiss SoftPOS SDK is proven on real hardware. "No card
   reader, your phone is the terminal" is the loudest product claim we make;
   it is the worst possible thing to put on an unproven SDK to win a sovereignty
   argument.
6. **Transactional email** whenever convenient — it is independent of all of the
   above.

---

## 5. What would make this a bad idea

Kill criteria, stated up front so they can be checked rather than argued:

- **The photo quality drops visibly** (§2.4) and there is no Swiss model that
  holds the bar. The AI-photography claim is worth more than the hosting claim.
- **Payrexx's SoftPOS is not available to platforms** embedding it in their own
  app, or is Android-only, or requires a per-merchant contract we can't
  automate. Then in-person stays on Stripe indefinitely and the story becomes
  "Swiss-hosted, Swiss-processed online" — still true, less complete.
- **Sub-merchant onboarding is heavier than Stripe Connect's.** Our whole pitch
  is "live this week"; a KYC flow that takes days moves the activation metric in
  the wrong direction and no amount of Swissness compensates.
- **The rates move.** Everything in §3.3 was verified 2026-08-01 from public
  pages; facilitator pricing is negotiable and volume-dependent, and the numbers
  should be reconfirmed at signup rather than trusted from this document.

---

## 6. Open questions for Payrexx

Only they can answer these; all of them gate a real decision:

1. Can a platform embed the SoftPOS/Tap to Pay SDK in **its own** iOS and
   Android apps, or is it only available through the Payrexx app?
2. What is the sub-merchant onboarding flow end to end — API-driven, or does
   each maker fill in a Payrexx-hosted form? How long until they can accept
   their first payment?
3. Exact TWINT rate for a platform's sub-merchants (1.25% or 1.3%, plus the
   CHF 0.18 or not).
4. Split/commission mechanics: can the platform commission be a percentage of
   the product subtotal excluding shipping (what `checkoutSession.ts` computes
   today), and is it reported per transaction for `platformFeeVerify`-style
   assertions?
5. Payout timing and currency handling for EU-shipping orders.
6. Refunds and partial refunds against a split payment — who bears the
   commission on a reversal?
7. Is there a test/sandbox environment with sub-merchants?

---

## Sources

- [Payrexx — Switching PSP: alternatives to Stripe in Switzerland](https://payrexx.com/en-ch/guides/alternatives-to-stripe-switzerland)
- [Payrexx — Split payments for Swiss marketplaces explained](https://payrexx.com/en/guides/split-payments-f%C3%BCr-schweizer-marktpl%C3%A4tze-einfach-erkl%C3%A4rt)
- [Payrexx — Payment solution for platforms and marketplaces](https://payrexx.com/en/solutions/platforms)
- [Payrexx — KYC and merchant onboarding for Swiss marketplaces](https://payrexx.com/en-gb/guides/kyc-und-h%C3%A4ndler-onboarding-f%C3%BCr-schweizer-marktpl%C3%A4tze)
- [Payrexx — Prices](https://payrexx.com/en-ch/pricing)
- [Payrexx — Tap to Pay Switzerland: providers & costs compared](https://payrexx.com/en-ch/guides/tap-to-pay-smartphone-terminal-switzerland-comparison)
- [Ingenico — How Payrexx and Ingenico bring SoftPOS to merchants across Switzerland](https://ingenico.com/en/newsroom/blogs/how-payrexx-and-ingenico-bring-softpos-merchants-across-switzerland)
- [Worldline — Tap to Pay on iPhone in Switzerland (March 2025)](https://worldline.com/en-ch/home/top-navigation/media-relations/press-release/pr-2025_03_18_01)
- [Stripe — Pricing (CH)](https://stripe.com/en-ch/pricing)
- [Stripe — Local payment methods pricing (CH)](https://stripe.com/en-ch/pricing/local-payment-methods)
- [Infomaniak — Cloud VPS prices](https://www.infomaniak.com/en/hosting/vps-cloud/prices)
- [Infomaniak — AI services (open-source models, hosted in Switzerland)](https://www.infomaniak.com/en/hosting/ai-services)
- [Infomaniak — AI services pricing](https://www.infomaniak.com/en/hosting/ai-services/prices)
- [Exoscale — Simple Object Storage (S3-compatible, Swiss zones)](https://www.exoscale.com/object-storage/)
- [Exoscale — Managed database pricing](https://calculator.exoscale.com/database/)
- [Exoscale — Swiss cloud hosting](https://www.exoscale.com/lp/swiss-cloud-hosting/)
