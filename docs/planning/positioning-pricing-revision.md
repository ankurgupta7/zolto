# Positioning & pricing revision — August 2026

> **Status: shipped.** This records what changed on the marketing surface after
> an external review checked Zolto's positioning against primary sources, and —
> more importantly — *why*, so the decisions don't get quietly reverted by
> someone who only sees the old rule.

The review is `zolto-vs-sumup-vs-worldline`, revised August 2026. It compared
Zolto, SumUp and Worldline for a Swiss maker, with every competitor figure
checked against a primary source. Its findings were mostly uncomfortable and
mostly correct.

---

## 1. The finding that mattered

**Zolto's "0% in person / 1% online" is a platform fee charged on top of
Stripe. It is not the cost of acceptance.** Every surface quoted it as though
it were — the pledge, the pricing page, and above all `FeeCalculator`, which
showed a merchant "CHF 0.00" while Stripe quietly took roughly three times
Zolto's cut on the same sale.

Compared like for like on a CHF 45 craft-fair sale:

| | Cost | Effective rate |
|---|---|---|
| SumUp Payments Plus (CHF 29/mo) | CHF 0.45 | 0.99% |
| Zolto — own TWINT QR | CHF 0.59 | 1.30% |
| SumUp — debit | CHF 0.68 | 1.50% |
| Worldline Tap on Mobile | CHF 0.77 | 1.70% |
| **Zolto — EEA card via Stripe** | **CHF 0.83** | **1.84%** |
| SumUp — credit | CHF 1.13 | 2.50% |

Zolto loses to SumUp Payments Plus and to Worldline Tap on Mobile in person,
and to SumUp on every plan online. **The reason to choose Zolto is that it
removes the work, not that it removes the fee.** Sold as "cheapest", the case
doesn't survive page one.

---

## 2. Rules that were reversed, and why

### 2a. "Quote no competitor pricing" → "quote nothing unsourced"

`COMPETITORS` carried a standing rule, enforced by a test, that the comparison
pages would publish no competitor rates at all: rates vary by country, contract
and volume, so any figure would be stale and unverifiable the day it shipped.

That rule was right about the failure mode and wrong about the remedy. It kept
the pages from saying the single most useful thing a buyer needs, it did nothing
about the one unsourced figure we *were* publishing (§2b), and the silence
flattered us — a reader who can't see the rates assumes the platform charging
"0% in person" is the cheap one.

**Replaced by a provenance rule.** `shared/sources.ts` is a citation registry
where every entry carries a URL and the date it was read; `shared/
costOfAcceptance.ts` holds the rates, each naming a source. A figure we can't
source doesn't ship — Worldline's negotiated terminal pricing stays on the
`NEGOTIATED` list with no number rather than getting a plausible one.

The old test became `"sources and dates every competitor figure it quotes"`.

### 2b. The CHF 2,000/year figure (closes G11)

`COST_COMPARISON.themPerYearChf` was `2000`, traceable to nothing but the
founder's recollection, and rendered on two pages as though researched. It was
the worst citation gap on the site and had been open as **G11** in
[`ai-traffic-alignment.md`](./ai-traffic-alignment.md) on the correct grounds
that inventing a citation would be worse than the gap.

Now computed: twelve months of SumUp Payments Plus plus a Solo reader
(CHF 447), with the basis stated on the page **and** the concession that the
money buys a card rate lower than ours. `multiplier` dropped its
"one-hundredth the cost" claim, which was never arithmetic.

### 2c. The card-reader lead is retired

`CARD_READER_GAG` and the "Card reader — sold to you, CHF 50–300+" comparison
row were built on a premise every competitor now shares: SumUp Tap to Pay and
Worldline Tap on Mobile both run on an ordinary phone in Switzerland, and
Worldline's carries no monthly fee. The constant and its tests are kept — the
joke is fine — but the landing section it anchored was arguing a point nobody
contests.

**Replaced by the squeeze play** (`POSITIONING.squeezePlay`, rendered by
`SqueezePlay.tsx`): SumUp has the item grid and cannot take TWINT; Worldline
takes TWINT and has no catalogue; only one of the three puts both on the same
screen. Drawn as three phones (`SqueezePlayTill`) because two panels with a
hole in them make the argument before the sentence does.

**On the wording.** A bare "no other solution offers both" is a claim about
every product in every country — unverifiable when written, stale a week later,
and exactly what `ZERO_COST_POS`'s doc comment already refuses. The published
claim is scoped to the field it can check: *"of the three ways a Swiss maker can
take a payment at a stall today, only one puts the catalogue and TWINT on the
same screen"*, with each half citing the vendor's own documentation. A test
keeps the unbounded form out.

---

## 3. Claims that were overstated and are now scoped

| Claim | Was | Is |
|---|---|---|
| `PLATFORM.summary` | "for a fraction of what legacy providers charge" | gone — the arithmetic disproves it |
| `PLATFORM.summary` | agents "find, recommend, and **buy**" | "…and **start a checkout** with" — `create_checkout` returns a payment link a human completes |
| `AI_NATIVE_PITCH.steps[2]` | "It checks out in the chat" | "It opens the checkout, your customer pays" |
| `AI_NATIVE_PITCH.proof.eyebrow` | "not a roadmap — live today" | "the rails are live — the traffic is still arriving" (`find_stores` returns an empty list until storefronts launch) |
| `FEATURES.ai-discovery` | discovery as a working channel | infrastructure ahead of the traffic, said so |

## 4. A correction the review itself got wrong

The review credits Zolto with **TWINT at 1.3% straight from the merchant's own
account**. That is true of only one of the two TWINT paths in `server/pos.ts`:

- `twint_qr` — the merchant's own static QR. Swiss end to end, 1.3%, and the
  money never passes through Stripe or Zolto. It is *attested* in the till, not
  captured by it.
- `twint` (`/api/pos/twint-intent`) — a **Stripe** PaymentIntent with
  `payment_method_types: ["twint"]`. Stripe's rails, at a TWINT rate Stripe does
  not publish. See `pricing-pivot-agent-commerce.md` §6 — the unmeasured delta
  is the whole business case for native TWINT.

`SOVEREIGNTY.ledger` described both with one row reading *"your own TWINT
account — Swiss rails, end to end"*, state `swiss`. That is the kind of quiet
elision the ledger exists to refuse. It is now two rows, and the second says
`moving`.

---

## 5. What is deliberately not here

- **The Worldline market-cap collapse and the Belgian money-laundering
  reporting.** The compare page carries the S&P downgrade and SIX's impairment
  — primary-sourced, and directly about the one property Worldline is chosen
  for. The rest reads as attack rather than analysis, and a test keeps it out.
  The section ends by conceding that Worldline processes Swiss payments
  normally and that Tap on Mobile is a good offer; without that it takes the
  credibility of the whole page with it.
- **Any "SumUp is British, post-Brexit" framing.** SumUp's European merchants
  contract with **SumUp Limited (Dublin)**, an EU-regulated e-money
  institution. The real SumUp gap is TWINT.
- **Changing the prices.** The review shows Zolto is the most expensive of the
  three online on rate. Whether to move `REVENUE_SHARE.freeBps` or
  `PLANS[].priceChf` is a business decision, not a copy fix. Both are single
  constants everything derives from, so it stays a one-line change whenever the
  owner wants it.

---

## 6. Two figures to confirm before quoting

Both ship as `confidence: "unverified"` with the question stated on the page,
rather than being silently resolved in our favour:

1. **Does Stripe class Swiss-issued cards in its EEA in-person bucket (1.4% +
   CHF 0.10) or the non-EEA one (2.9% + CHF 0.10)?** It moves Zolto's in-person
   row by more than a full percentage point. Both readings are published.
2. **Is the Saferpay price list, dated 09.2022, still current?** Its source row
   carries that note.

When either is answered, edit the row in `shared/costOfAcceptance.ts` and the
source's `retrievedOn` in `shared/sources.ts`. Nothing else needs touching —
the pricing page, `/compare`, `/llms-full.txt` and MCP all render from them.

---

## 7. Where it lives

| Concern | File |
|---|---|
| Citations (URL + retrieval date) | `shared/sources.ts` |
| Rates, the stacked cost model, the CHF 45 basket | `shared/costOfAcceptance.ts` |
| Squeeze play, capability matrix, limitations, buyer fit, competitor risks | `shared/platform.ts` |
| The rate table | `client/src/marketing/components/CostOfAcceptance.tsx` |
| The capability matrix | `client/src/marketing/components/CapabilityMatrix.tsx` |
| Three tills, one with both | `client/src/marketing/components/SqueezePlay.tsx` + `MarketingIllustrations.tsx` |
| Whole-bill calculator | `client/src/marketing/components/FeeCalculator.tsx` |
| Machine-readable | `server/mcp.ts` (`get_cost_comparison`), `shared/marketing.ts` (`/llms-full.txt`) |

> If you change a rate, change it in `shared/costOfAcceptance.ts`. The pricing
> page, the comparison pages, `/llms-full.txt`, the MCP tool and the fee
> calculator all render from it, and the tests in `costOfAcceptance.test.ts`
> will hold the story together.
