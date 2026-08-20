# Gwinn — Feature Backlog: what we're building, and what we're not

> Companion to [`./pricing-pivot-agent-commerce.md`](./pricing-pivot-agent-commerce.md).
> Assesses the nine-item backlog from the pricing & product handoff against
> what's actually in the repo, and records the build decision for each.
> Document version: 1.0

The handoff's own instruction is the one worth keeping: **do not build all of
these.** A vendor needs one obviously-magic reason to switch, not nine
half-built ones. So this document says no to more things than it says yes to.

---

## The decision, in one table

| # | Feature | Verdict | Why |
|---|---|---|---|
| 2 | Merchant-owned, agent-neutral storefront | ✅ **Built** | The sharpest wedge, and the pricing model doesn't work without it |
| 1 | Camera-first "point & sell" onboarding | ✅ **Gaps closed** | Price suggestion + four languages now ship; see below |
| 3 | Hyper-local demand & pricing intelligence | ⛔ **Not now** | We'd be inventing the data it needs |
| 4 | Chat / WhatsApp-native reserving | ⏸ Later | Overlaps #2; revisit once agent traffic is real |
| 5 | Swiss-dialect voice operation | ⏸ Later | Real moat, specialist build, not a launch dependency |
| 6 | Genuinely offline-first stall operation | ⏸ Later | Architectural; needs its own project |
| 7 | One-hand, outdoor, glove-friendly UX | ⏸ Later | Retention polish, cheap to do continuously |
| 8 | Swiss admin autopilot (VAT, Treuhänder export) | ⏸ Later | Most stall vendors sit under the VAT threshold |

---

## ✅ #2 — Agent-neutral commerce (built)

**What shipped.** Every storefront's MCP endpoint gained a `create_checkout`
tool. Any agent — ChatGPT, Claude, Gemini, Perplexity, anything speaking MCP —
can now search a vendor's catalogue and **buy from it**, receiving a Stripe
Checkout link that pays the merchant's own connected account. No marketplace,
no intermediary, no account with anyone but the merchant.

**Why this one first, ahead of the handoff's own ordering.** Two reasons.

The first is the handoff's own argument, which holds up: Shopify's Agentic
model requires Shopify to *be* the intermediary that owns the agent
relationship and takes the cut. They structurally cannot hand merchants a
disintermediated endpoint without wrecking that revenue. Gwinn can, because
it doesn't run that toll booth.

The second is specific to what we just shipped and is the stronger reason.
The new pricing monetizes **online + agent-originated sales**, tracks
agent-originated sales as a distinct channel, and makes "% of free in-person
vendors with ≥1 online/agent sale per month" the north-star metric — but
before this change **nothing in the product could produce an agent-originated
sale.** The MCP endpoint was read-only. We had the meter, the fee, and the
metric, and no way to move any of them. The pricing model was, in its
differentiating half, unbuildable revenue. This closes that loop.

**Design decisions worth knowing.**

- **The agent gets a payment link, not a charge.** It never touches card
  details. Agent-initiated *payment* (delegated credentials, AP2/ACP-style
  protocols) is nascent and a security minefield; handing the buyer a Stripe
  Checkout URL works with every agent that exists today and keeps the trust
  boundary where it belongs. "Reserve and buy" in the handoff is satisfied:
  the items *are* reserved, and the purchase *does* complete.
- **One checkout implementation, two front doors.** The web cart and the agent
  tool both call `server/checkoutSession.ts`, so an agent order gets the same
  inventory hold, shipping rules, platform fee, and Stripe treatment as a
  human's. The agent layer is a new doorway, not a parallel checkout that can
  drift.
- **Every sale through the endpoint is `channel: "agent"`** by definition —
  that is what makes the differentiator measurable rather than asserted.
- **It stays on for Free tenants,** deliberately: it's the discovery wedge,
  monetized by the 1% rather than by a paywall.
- **Rate limited.** A checkout reserves real inventory for 30 minutes, so a
  looping agent could otherwise hold a whole stall's catalogue and lock out
  every other buyer, human or agent. `server/rateLimit.ts` caps it per store
  per caller. Note this is the repo's *first* rate limiter — its in-process
  counters are honest about being single-instance, and should move to Redis
  or the DB before Gwinn runs more than one app instance.
- **Advertised where agents look:** each store's `/llms.txt` says plainly that
  it can be bought from, and `get_store_info` reports `canBuyHere` so an agent
  doesn't have to attempt a purchase to discover whether the merchant has
  connected payments. A tool no agent knows about is not a wedge.
- **Discovery — `find_stores` on the platform MCP.** An agent at gwinn.com can
  now list merchant storefronts and receive, for each one, that merchant's own
  storefront URL, llms.txt, and MCP endpoint. It is a directory, not a
  marketplace, and the distinction is load-bearing: Shopify's agentic model
  requires Shopify to remain the intermediary that owns the agent relationship
  and takes the cut, whereas this introduces the agent to the merchant and
  then gets out of the way — the transaction and the money never touch Gwinn.
  Only stores with visible, in-stock products are listed, so an agent is never
  sent to a dead end. If a merchant ever asks to be delisted, that belongs in
  tenant settings as an explicit opt-out.

---

## ✅ #1 — Camera-first onboarding (gaps closed)

The handoff described this as new. Most of it was already shipped — bulk photo
upload with AI analysis, descriptions and translation, photo→product intake
over WhatsApp/Slack/Discord, AI photo restyling, per-product locales — so the
work was finishing it, not rebuilding it.

**Price suggestion, grounded rather than guessed.** `bulkAnalyze` now proposes
a price. The important design choice is what it's based on: the merchant's own
live catalogue (`getCategoryPriceStats` — per-category min/max/**median**,
median so one CHF 900 statement piece can't drag the suggestion for CHF 45
studs). A model guessing a market price from a photo would be inventing
authority it doesn't have.

**A store with no pricing history gets no suggestion at all** — the field
stays empty and says "set your own price." This is the part worth defending: a
new maker is exactly the person most likely to accept whatever number we show,
so a confident guess there could have them mis-price their own work for
months. An empty field is the honest answer. The same rule holds when the
model returns something nonsensical (zero, negative) and on the AI-failure
path. When a price *is* suggested, the merchant sees the reasoning next to it
("in line with your other Rings, CHF 50–120") and can overrule it.

**Four languages, including Italian.** Switzerland has four national
languages; the schema had DE/FR/EN only, so a Ticino customer got German.
Migration `0009` adds `nameIt`/`descriptionIt`, `localize.ts` routes `it-*`,
and both the drafting and translation paths now fan out to DE/FR/IT/EN.

**Still open:** the camera-first *entry point* ("open app, point at crate") is
UX surfacing rather than capability — everything behind it now exists.

---

## ⛔ #3 — Hyper-local demand intelligence (not now)

The most seductive item, and the one to refuse for launch.

It needs per-market sales history to say anything true. Gwinn has one pilot
tenant at roughly 60 sales a month. A model trained on that would produce
confident-sounding advice — "bring more soup veg" — with nothing behind it.
Vendors would follow it, since that's the whole point, and the failure mode
isn't an unhelpful feature but **a vendor buying stock they can't sell on our
say-so.** It also needs weather and local-event feeds, which are new external
dependencies with their own reliability and cost.

The moat argument is real and the feature should exist eventually. The
precondition is data volume, and the honest sequencing is: ship #2, get
vendors selling, accumulate history, then build this on evidence. Revisit
when a market has a season or two of real sales behind it.

---

## Why the P1/P2 items wait

- **#4 chat reserving** overlaps #2's transaction path; building both at once
  means two half-finished reservation flows.
- **#5 dialect ASR** is a genuine moat and a genuine specialist project.
  Nothing about the launch depends on it.
- **#6 offline-first** is an architectural stance, not a feature — it means
  local-first storage and a sync/conflict model. It deserves its own project
  and its own decision, not a corner of a pricing sprint.
- **#7 outdoor UX** is continuous polish; fold it into normal work.
- **#8 Swiss admin autopilot** is correctly flagged in the handoff itself as
  below the VAT threshold for most stall vendors. Its rates need verifying
  against current official sources before anything is wired.

---

> The story the built feature tells: *"any AI agent can buy from you, and the
> money goes straight to you."* That is one sentence, it is true today, and no
> incumbent can say it without undercutting their own toll booth.
