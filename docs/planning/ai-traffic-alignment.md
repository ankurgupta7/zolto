# AI Traffic Alignment — closing the gaps against the WebFX 600K-session study

**Status:** in progress · **Owner:** — · **Started:** 2026-07-30

This plan maps Zolto against the findings in WebFX's
["What 600,000 AI Sessions Reveal About the Content That Wins AI Traffic"](https://www.webfx.com/blog/ai/what-content-earns-ai-traffic/)
(published 2026-07-21; 590,868 AI sessions across 2,500 URLs, 15+ industries), and
records the work to align with it.

Progress is tracked with checkboxes in this file. When a phase lands, tick its
items here and move the corresponding row to ✅ in
[`phase1/tracker.md`](./phase1/tracker.md), per the convention in
[`README.md`](./README.md).

---

## 1. What the study found

The numbers that drive this plan:

| Finding | Figure |
|---|---|
| Share of AI traffic → homepages | **31.3%** |
| Share → product pages | **16.8%** |
| Share → service pages | 11.4% |
| Share → blog articles | 11.3% |
| Share → FAQ/resource pages | 7.2% |
| Traffic landing on consideration + decision-stage content | **92%** |
| Traffic landing on awareness-stage content | 2.3% |
| Traffic landing on transactional content | ~70% |
| Referrals originating from ChatGPT | **97.5%** |
| Highest "AI Lift" (AI share − organic share) | blog **+7.3pp**, product **+7.1pp**, FAQ/resource **+5.3pp** |
| Lowest AI Lift (Google still leads) | homepages −12.7pp, location −4.7pp, tools −3.0pp |
| Specificity score of pages cited by AI | 4.76 / 5 |
| Completeness score of pages cited by AI | 4.15 / 5 |
| Top pages carrying expert credentials | >2/3 |
| Top pages carrying original research / first-party data | 52.6% |
| Extra AI traffic for pages with citations | **+26%** |

Methodology caveats worth holding onto: the study measures **referral traffic, not
citations**; it samples the *highest-performing* AI pages rather than the average
page; and the platform mix (97.5% ChatGPT) will shift.

## 2. How Zolto maps onto it

Zolto has **two** distinct surfaces that earn AI traffic, and they are at very
different levels of readiness:

| | zolto.ch (marketing) | Tenant storefronts (`*.zolto.shop`) |
|---|---|---|
| Server-rendered title / meta / canonical | ✅ `server/marketingSeo.ts` | ⚠️ title + description + favicon only |
| JSON-LD injected server-side | ✅ Organization, WebSite, SoftwareApplication, FAQPage, Article, Breadcrumb | ❌ none |
| `<noscript>` body for non-JS crawlers | ✅ | ❌ none |
| Sitemap | ✅ | ❌ serves the *marketing* sitemap |
| `llms.txt` / MCP | ✅ | ✅ (genuinely good — product-aware, buyable) |

`server/marketingSeo.ts` opens with the correct thesis — *"most AI crawlers
(GPTBot, ClaudeBot, PerplexityBot, …) do NOT execute JavaScript, so a client-only
`<head>` is invisible to them."* That insight was applied to the marketing site and
**not** to storefronts, which is where **48.1%** of AI traffic lands
(31.3% homepages + 16.8% product pages).

This is also a **product-claim risk**, not only an SEO gap: `FEATURES.ai-discovery`
in `shared/platform.ts` sells "Discoverable by AI assistants", and the Free plan
advertises "Found by AI agents — llms.txt, MCP & store chat". `llms.txt` and MCP
do deliver for agents that speak those protocols; the ordinary crawler path is
weaker than the claim implies.

---

## 3. Gap register

Ranked by the traffic weight the study assigns, not by effort.

### Tier 1 — Storefront crawler parity (~48% of the AI-traffic surface)

- **G1. Product JSON-LD is client-only.** `client/src/pages/ProductDetail.tsx`
  renders `Product` schema inside React, so non-JS AI crawlers never see it.
  Product pages: 16.8% of AI traffic, **+7.1 AI Lift** — the second-largest
  opportunity in the study.
- **G2. Storefront homepages have no structured identity.** `Home.tsx`, `Shop.tsx`,
  `About.tsx` emit no JSON-LD at all. `injectStorefrontHead` only swaps favicon,
  title and description — no canonical, no `Store`/`LocalBusiness` node, no
  `<noscript>`. Homepages are 31.3% of AI traffic, the largest single category.
- **G3. `/sitemap.xml` is host-blind — a live defect.** `server/seo.ts` calls
  `renderSitemapXml()` with no tenant resolution (unlike `server/llms.ts`, which
  resolves tenants correctly). A storefront therefore serves Zolto's *marketing*
  sitemap, advertising `/pricing`, `/blog` and `/signup` — all 404 on that host.
  No storefront sitemap generator exists.
- **G4. `robots.txt` is host-blind** in the same way, pointing every storefront at
  the marketing sitemap.

### Tier 2 — Missing page types with the highest AI Lift

- **G5. No FAQ page exists.** Fourteen FAQs live in `shared/platform.ts` and are
  emitted as FAQPage JSON-LD, into `llms.txt`, and over MCP — but there is no
  human-visible `/faq` route in `MarketingApp.tsx`. FAQ/resource pages are 7.2%
  of AI traffic at **+5.3 AI Lift**. The content is already written and reviewed;
  this is the cheapest win in the repo.
- **G6. No standalone comparison pages.** `INCUMBENT_COMPARISON` and
  `POSITIONING.incumbents` (Stripe, SumUp, Worldline) exist as structured data but
  render only as a section inside `Landing.tsx`. Comparison content is core
  decision-stage material, and 92% of AI traffic lands there.
- **G7. Thin blog.** Three posts, one series, one maker — in the category with the
  **largest AI Lift (+7.3)**.
- **G8. No industry or audience pages**, despite an explicitly segmented audience
  (jewelry, crafts, boutiques, market stalls).
- **G9. No location pages.** Zolto is Switzerland-specific (TWINT, CHF, Zurich).
  Location pages are organic-strong rather than AI-strong (−4.7 AI Lift), so this
  is a Google play, but Zolto currently captures neither channel.

### Tier 3 — Trust signals

- **G10. Every author is an `Organization`, never a named `Person`.** See
  `server/marketingSeo.ts` and `client/src/marketing/content/launchContent.ts`.
  The study lists identifying authors as a reinforcing expertise signal, and >2/3
  of top pages carried expert credentials.
- **G11. No citations anywhere** on the marketing surface — pages with citations
  averaged **+26% AI traffic**.
- **G12. Original research is present but unpackaged.** Launch Diary #3 carries
  genuinely citable first-party data (12 orders, CHF 61 average, 81% AI chatbot
  resolution) buried in narrative, rather than published as a methodology-backed
  research asset others would cite. 52.6% of top pages carried original research.

### Tier 4 — Minor

- **G13. robots.txt AI-crawler blocks skip `NOINDEX_PATHS`.** `User-agent: *` gets
  `Disallow: /signin`, but each AI-crawler group gets a bare `Allow: /`, so AI bots
  are told they may crawl the sign-in bounce. Inconsistent with intent.
- **G14. Crawler allowlist gaps.** Well-chosen already (covers the 97.5% ChatGPT
  case via GPTBot / OAI-SearchBot / ChatGPT-User). Missing `Perplexity-User`
  (user-initiated, distinct from `PerplexityBot`) and Bing/`msnbot` (Copilot rides
  Bing). Low impact, since `User-agent: *` already allows everything.

### Cross-cutting opportunity

- **G15. Bake the study's rubric into the AI description generator.** The
  specificity (4.76/5) and completeness (4.15/5) rubrics could prompt tenants'
  generated product copy toward concrete facts, materials, dimensions and pricing.
  That turns a marketing insight into a product feature which lifts every tenant's
  AI visibility at once — exactly what `FEATURES.ai-discovery` promises.

---

## 4. Phased plan

Every change ships with tests in the same commit, per [`CLAUDE.md`](../../CLAUDE.md).
`server/marketingSeo.test.ts`, `server/seo.test.ts` and `server/htmlHead.test.ts`
are the patterns to copy.

### Phase 1 — Storefront crawler parity  *(closes G1–G4, G13, G14)* ✅ **Done**

- [x] `server/storefrontSeo.ts` — per-route title, description, canonical and
      `<noscript>` for `/`, `/shop`, `/product/:id`, `/about`, `/contact`, `/faq`
- [x] Shared `Product` JSON-LD builder (`shared/storefront.ts`) used by both the
      server injector and `ProductDetail.tsx`, so the two can't drift
- [x] `Store` / `WebSite` / `CollectionPage` / `Breadcrumb` JSON-LD on storefront routes
- [x] Tenant-aware `/sitemap.xml` — real product URLs, resolving the tenant the way
      `registerLlmsRoutes` already does
- [x] Tenant-aware `/robots.txt` pointing at the storefront's own sitemap
- [x] G13: disallow list repeated inside each AI-crawler group (an agent obeys only
      its most specific matching group, so a bare `Allow: /` exempted those bots)
- [x] G14: added `Perplexity-User` and `bingbot` (Copilot rides Bing) to the allowlist
- [x] Tests — `shared/storefront.test.ts` (20), `server/storefrontSeo.test.ts` (22),
      `server/seo.test.ts` extended to cover both surfaces

**Also landed:** `server/headInject.ts` extracts the HTML-rewriting primitives that
`marketingSeo.ts` and `storefrontHead.ts` had each copied, rather than adding a
third copy.

**Decision recorded:** the shared `Product` builder deliberately emits **no**
`shippingDetails`. The previous client-side schema claimed a flat
`shippingRate: 0` against an empty `DefinedRegion` — i.e. free shipping
everywhere — which contradicts the real rules (free over CHF 50 within CH, flat
CHF 8 below, CHF 15 to the EU; `server/checkoutSession.ts`). Modelling those
properly means lifting the rate constants into `shared/`, which is
payment-adjacent and wants its own change. Until then, no claim beats a wrong one.

### Phase 2 — Ship the high-lift pages  *(closes G5, G6)*

- [ ] `/faq` marketing route rendering `FAQS`, with FAQPage JSON-LD attached to it
- [ ] `/compare/zolto-vs-{stripe,sumup,worldline}` built from `INCUMBENT_COMPARISON`
      and `POSITIONING`
- [ ] Both wired into `marketingSitemapEntries()`, `getMarketingSeo()` and `llms.txt`
- [ ] Tests

### Phase 3 — Trust signals  *(closes G10–G12)*

- [ ] Named `Person` authors with credentials in Article JSON-LD and visible bylines
- [ ] Citations for the load-bearing factual claims (e.g. the CHF 2,000/year
      incumbent-cost figure)
- [ ] Tests

### Phase 4 — Segment coverage  *(closes G8; G7 and G9 are content work)*

- [ ] Industry/audience pages for Zolto's named segments
- [ ] Wired into sitemap, SEO and `llms.txt`
- [ ] Tests

### Deferred (deliberately not in this plan)

- **G7 (blog cadence)** and **G9 (location pages)** are editorial work, not
  engineering work. The infrastructure to publish them exists after Phase 2.
- **G13/G14** were one-line robots.txt tweaks; folded into Phase 1 (done).
- **Shipping in `Product` structured data** — see the Phase 1 decision note. Wants
  the rate constants moved from `server/checkoutSession.ts` into `shared/`.
- **Storefront FAQ schema** stays client-rendered for now: the copy lives in
  `client/src/lib/storefrontContent.ts`, and having the server import from
  `client/` to reach it would invert the dependency. Moving that template copy
  into `shared/` is the clean fix, bundled with Phase 2's FAQ work if it's cheap.
- **G15** is a product change to the AI description generator, and wants its own
  design pass — it touches tenant-visible output quality, not just markup.

---

## 5. How we'll know it worked

The study measures referral traffic, so the honest check is the same one it used:

1. `curl` each surface with an AI-crawler user agent and confirm title, canonical,
   JSON-LD and `<noscript>` are present **without** executing JavaScript.
2. Validate emitted JSON-LD against schema.org.
3. Confirm a storefront's `/sitemap.xml` lists that store's products and no
   marketing URLs.
4. Longer-term: segment AI referral traffic by page type in analytics and compare
   the shape against the study's distribution.
