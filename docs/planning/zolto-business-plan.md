# Zolto Business Plan

> AI-run commerce platform for makers and artisans.  
> Kalakosh (jewelry, Switzerland) is Tenant #1 — our launch partner, not our revenue model.  
> Document version: 1.1 | Prepared for advisor review

> **v1.1 revisions (advisor-readiness pass):** (1) reframed AI from "moat" to velocity/cost advantage — maker-first UX + POS/online parity are the real wedge; (2) corrected the Kalakosh content-release reasoning (a release **is** required — §5.1); (3) reconciled the €9 founder price vs €35 blended ARPA arithmetic (§4.3, §7.2); (4) relabeled market sizing as illustrative/unvalidated with a validation task (§2.2); (5) added a hard human-merge gate for AI-authored billing/auth/inventory changes (§1.3, §6.1, §8.1); (6) elevated Kalakosh single-point-of-failure to a RED risk with a second-pilot mitigation (§8.1); (7) split Swiss FADP from EU GDPR and flagged EU OSS + CH VAT (§7.1, §8.1); (8) added a fallback content plan if the launch kill condition fires (§8.3).

---

## Executive Summary

Zolto is an AI-run commerce platform that lets makers and artisans sell online and in-person without managing technology. Our first tenant, Kalakosh, is a jewelry maker in Switzerland doing ~60 offline sales per month who is launching their first online store using Zolto.

**The Business Model:** Kalakosh is free. Revenue comes from online-discovered customers who sign up via self-serve, attracted by content documenting Kalakosh's launch journey. Operations are almost entirely AI-run — an AI chatbot handles support, builds features on request, and drives content production.

**The Opportunity:** The maker/artisan segment is underserved at the €20–€50 price point by tools that treat POS and online as one product built for someone who sells at markets, not a store chain. Square is free but feature-limited. Shopify starts at $39 but is not maker-specific. WJewel charges $99–$399 for jewelry-specific features. Zolto's durable wedge is **maker-first design plus true POS/online parity**; AI (product descriptions, support, onboarding) lowers operating cost and speeds iteration, but we treat it as a cost/velocity advantage rather than a defensible moat — incumbents are adding comparable AI features, and we plan accordingly (see §1.2, §2.3, and §8).

**Phase Timeline:** Content engine (Months 1–2) → Productize & automate (Months 3–5) → Acquire via organic (Months 5–9) → Scale the AI engine (Months 9–18).

---

## 1. Company Overview

### 1.1 What Zolto Is

Zolto is a multi-tenant commerce platform. Two of its three pillars are structural differentiators; the third is an operating advantage we do not claim as a moat:

1. **Maker-First Design (primary wedge):** Built for artisans who sell at craft fairs and markets, not retail chains. The product assumes the user is a maker, not a store manager. This is the hardest thing for a generalist incumbent to retrofit.
2. **POS + Online Parity (primary wedge):** Unlike Shopify (online-first) or Square (POS-first), Zolto treats both channels as equal, with real-time inventory sync — the workflow a market-and-online maker actually needs.
3. **AI-Assisted Operations (velocity/cost advantage, not a moat):** An AI chatbot resolves customer queries, drafts features from customer requests, and generates content — lowering founder operational cost and increasing iteration speed. We assume incumbents will match AI feature-for-feature; our edge here is _how fast_ we ship on top of the maker wedge, not the AI itself.

### 1.2 The Zolto Architecture (Multi-Tenant)

```
Zolto Platform
├── Tenant 1: Kalakosh (jewelry, CH)
│   ├── POS: ~60 sales/month (offline, in-person)
│   ├── Online store: launching with this plan
│   └── Admin: kalakosh.ch
├── Tenant 2+: Future customers (makers, artisans, small retailers)
│   └── Onboarded via self-serve, AI-guided setup
└── Shared Infrastructure
    ├── AI chatbot (support + feature building)
    ├── Payment processing (Stripe)
    ├── Content generation pipeline
    └── Tenant isolation (products, orders, customer data)
```

**Key implication:** Kalakosh is not "a customer on a custom install." They are Tenant #1 on a multi-tenant platform. Every feature they validate is immediately available to future tenants.

### 1.3 The AI Chatbot (Deployed and Working)

The AI chatbot is not aspirational — it is already deployed and functional. Current capabilities:

- Resolves customer queries about product features
- Builds new features based on customer requests (e.g., "Can I add product variants?" → variant system built and deployed)
- Reduces support burden to near-zero

**Current performance (to be baselined in Phase 1):**

| Metric                 | Baseline       | Phase 1 Target            | Phase 4 Target                                                                                     |
| ---------------------- | -------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Resolution rate        | Measure week 1 | >80%                      | >95%                                                                                               |
| Avg response time      | Measure week 1 | <5s                       | <2s                                                                                                |
| Escalation rate        | Measure week 1 | <20%                      | <5%                                                                                                |
| Feature build requests | Tracking       | Document in iteration log | Auto-deploy _cosmetic/content_ changes only; billing/auth/inventory always human-merged (see §8.1) |

---

## 2. Market Opportunity

### 2.1 Target Customer

**Primary:** Solo makers and artisans who sell at craft fairs, markets, or pop-ups and want to add online sales without managing technology.

**Profile (Kalakosh is the prototype):**

- 1–3 person business
- 30–200 sales/month offline
- No existing online store (or abandoned one)
- Product catalog: 20–500 items
- Tech comfort: low to medium
- Price sensitivity: high — every € matters

**Secondary:** Small retail shops (1–5 staff) that need POS + online sync and find Shopify/Square too generic or expensive.

### 2.2 Market Size (Illustrative — Not Yet Validated)

> **Caveat:** The figures below are illustrative order-of-magnitude estimates, not a sourced bottom-up model. "Top 10%/5%" is a rough proxy for "makers/retailers digitally active enough to adopt a paid POS+online tool," not a segmentation we have validated. Treat this as a sizing sketch to confirm the market is large enough to matter (it is), not as a defensible TAM. **Validation task (Phase 2):** replace with sourced figures — e.g. craft-fair/market-vendor registries, Eurostat SME counts, and Stripe/Square adoption benchmarks for the CH/DACH region.

| Segment                                   | Est. Size (illustrative) | Rough Addressable       |
| ----------------------------------------- | ------------------------ | ----------------------- |
| Solo makers in EU/CH needing POS + online | ~500,000                 | ~10% ≈ 50,000           |
| Small retailers (1–5 staff) in EU/CH      | ~2M                      | ~5% ≈ 100,000           |
| **Total (illustrative)**                  |                          | **~150,000 businesses** |

At €19–€49/month blended: a **~€34M–€88M/year illustrative TAM**. Even discounted by an order of magnitude for over-optimistic addressability, the market comfortably supports the Phase 4 target of 50+ customers.

### 2.3 Competitive Landscape (2026 Pricing)

| Competitor      | Monthly Price  | POS + Online | Maker-Specific?   | AI Features?                   |
| --------------- | -------------- | ------------ | ----------------- | ------------------------------ |
| **Square**      | $0 (free plan) | Basic only   | No                | No                             |
| **Shopify POS** | $39–$299/mo    | Yes          | No                | Basic (Shopify Magic)          |
| **Lightspeed**  | $89/mo         | Yes          | No                | No                             |
| **WJewel**      | $99–$399/mo    | Yes          | Yes (jewelry)     | No                             |
| **Clover**      | $15/mo         | Yes          | No                | No                             |
| **Zolto**       | €0–€99/mo      | Yes          | Yes (maker-first) | Yes (assume matched over time) |

> **Note on the AI column:** by 2026 AI product descriptions and AI support chat are becoming table stakes — Shopify (Magic/Sidekick) and others are shipping them. We do **not** treat "has AI" as a moat. The last column reflects presence of AI features today, not a defensible advantage.

**The Gap:** No competitor combines **maker-specific design + true POS/online parity** at the €19–€49 price point. That combination — not AI alone — is the wedge. AI is how we deliver it cheaply and iterate faster than a generalist incumbent will bother to for this segment.

---

## 3. Product & Technology

### 3.1 Feature Set by Tier

| Feature         | Free (€0) | Maker (€19) | Studio (€49)        | Atelier (€99)      |
| --------------- | --------- | ----------- | ------------------- | ------------------ |
| Products        | 50        | Unlimited   | Unlimited           | Unlimited          |
| Staff/users     | 1         | 1           | 5                   | 20                 |
| POS             | Basic     | Full        | Full                | Full + API         |
| Online store    | No        | Yes         | Yes + custom domain | Yes + advanced     |
| AI descriptions | 10/month  | Unlimited   | Unlimited           | Unlimited + custom |
| Bulk upload     | No        | Yes         | Yes                 | Yes                |
| Inventory sync  | No        | Yes         | Real-time           | Real-time          |
| Analytics       | Basic     | Standard    | Advanced            | Custom             |
| Support         | Community | Email       | Priority            | Dedicated          |

### 3.2 Core Technology Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Frontend | React + Tailwind CSS                        |
| Backend  | Node.js + Express                           |
| Database | MySQL (multi-tenant, tenant_id scoped)      |
| ORM      | Drizzle                                     |
| Payments | Stripe Elements (PCI handled by Stripe)     |
| AI       | OpenAI API (chatbot, descriptions, content) |
| Hosting  | TBD (scalable cloud)                        |

### 3.3 The Iteration Log (Product Roadmap)

Every feature request from Kalakosh (via the AI chatbot) is logged and tracked:

```typescript
// Schema: drizzle/schema.ts
export const iterationLogs = mysqlTable("iteration_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // 1 = Kalakosh
  request: text("request").notNull(),
  solution: text("solution").notNull(),
  deployedAt: timestamp("deployed_at"),
  validated: boolean("validated").default(false),
  impact: mysqlEnum("impact", ["critical", "high", "medium", "low"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

**Example entries:**

| Date       | Request                               | Solution                       | Impact   | Validated? |
| ---------- | ------------------------------------- | ------------------------------ | -------- | ---------- |
| 2026-06-01 | "Need to upload 100 products at once" | Built CSV bulk upload          | High     | ✅         |
| 2026-06-15 | "Discord bot should create products"  | Added Discord product creation | Critical | ✅         |
| 2026-07-01 | "POS needs offline mode"              | Added local SQLite sync        | High     | ⏳         |

This log serves three purposes: product roadmap, sales credibility ("we iterate fast"), and case study content.

---

## 4. Business Model & Pricing

### 4.1 Revenue Model

**Primary:** Monthly SaaS subscriptions (self-serve, no sales team).
**Secondary:** Transaction fees (small % on Stripe processing, competitive with market).
**Tertiary:** Add-ons (custom AI training, advanced analytics, white-label).

**Kalakosh is not a revenue source.** They are free (Tenant #1, launch partner). All revenue comes from online-discovered customers who sign up via the website.

### 4.2 Pricing Tiers

| Tier        | Price  | Target                      | Competitive Position                                     |
| ----------- | ------ | --------------------------- | -------------------------------------------------------- |
| **Free**    | €0/mo  | Makers exploring            | Lower than Square ($0), feature-limited to drive upgrade |
| **Maker**   | €19/mo | Solo makers (Kalakosh tier) | 50% below Shopify Basic ($39), includes AI descriptions  |
| **Studio**  | €49/mo | Small teams                 | Matches Shopify Basic, adds AI + POS sync                |
| **Atelier** | €99/mo | Growing brands              | Below WJewel ($99–$399), AI-native differentiation       |

### 4.3 Pricing Discovery Method

Since Kalakosh is free, pricing signal comes from:

1. **Competitor benchmarking** (completed — see Section 2.3)
2. **A/B testing on website** (Phase 1: test €19 vs €29 for Maker tier)
3. **Pre-order validation** (offer "founder pricing" at €9/mo for the first 10 customers — a discovery/discount lever, _not_ the steady-state price)
4. **Van Westendorp survey** (Phase 2: survey website visitors)

> **Founder pricing ≠ modeled ARPA.** The €9 founder rate is a temporary acquisition discount to buy early validation and testimonials. The financial model (§7) is built on **blended ARPA of €35/mo** at steady state. The two must not be conflated: see §7.2 note for how the Phase 2 cohort is treated.

---

## 5. Go-to-Market Strategy

### 5.1 The Kalakosh Launch Story (Content Engine)

Kalakosh's journey — from 60 offline sales/month to launching their first online store — is the core content asset. The narrative is authentic, not hype-driven.

**Content Assets:**

| Asset                    | Format                   | SEO Target                           |
| ------------------------ | ------------------------ | ------------------------------------ |
| Launch Diary (4–5 posts) | Blog series              | "how to launch jewelry store online" |
| Before/After             | Photo + honest metrics   | "jewelry pos before after"           |
| Setup Guide              | Step-by-step tutorial    | "how to set up maker pos"            |
| AI Feature Deep-Dive     | How AI descriptions work | "ai product descriptions maker"      |
| Video Walkthrough        | 2-min store setup        | YouTube + embedded                   |
| Customer Interview       | Q&A with Kalakosh        | "maker interview pos"                |

**Key messaging rule:** Never claim "10x growth" or "massive revenue." Kalakosh's value is authenticity. A maker who went from 0 to online is relatable.

> **Content release is required — get it signed before publishing.** A prior draft assumed "Kalakosh is owned by Sheena Arora, so no content release form is needed." That reasoning is wrong. Whether Sheena _owns Kalakosh_ is irrelevant to whether **Zolto (a separate legal party)** may commercially use her name, likeness, photos, video, and business story to market the platform to other paying customers. That is exactly the situation a content/publicity release exists for — covering right of publicity, image rights, and permission to use her brand in Zolto's marketing. **Action:** get a signed content release (and ideally a lightweight pilot-partnership agreement covering the free-tier terms, exclusivity, and how her story may be used) _before_ the Launch Diary series goes live. This is cheap to do now and expensive to unwind later. It is retained as a Phase 1 success criterion (§9).

### 5.2 Content Production Model (AI-Assisted)

| Task             | AI Does                              | Human Does                   | Time/Week        |
| ---------------- | ------------------------------------ | ---------------------------- | ---------------- |
| First draft      | Writes from Kalakosh data + outline  | Review, edit, add voice      | 1–2 hrs          |
| SEO optimization | Suggests keywords, meta descriptions | Approve or override          | 15 min           |
| Social posts     | Generates 3 variants per post        | Schedule + engage            | 30 min           |
| Email nurture    | Sequences based on user behavior     | Set strategy, review metrics | 30 min           |
| **Total**        |                                      |                              | **2–3 hrs/week** |

**The 2-hour rule:** If content takes >3 hrs/week, fix the AI prompts — not the schedule.

### 5.3 Channel Strategy

| Phase | Channel                      | AI Role                     | Human Role        |
| ----- | ---------------------------- | --------------------------- | ----------------- |
| 1–2   | SEO content (Kalakosh story) | Draft blog posts            | Edit, publish     |
| 1–2   | Social media                 | Generate posts from content | Schedule, engage  |
| 3     | Organic search               | Optimize based on data      | Strategy          |
| 3     | Email nurture                | Auto-sequences              | Direction         |
| 4     | Product-led growth           | AI guides to value          | Feature decisions |

**No paid ads until Phase 4.** Content must prove it can drive organic sign-ups first.

### 5.4 The 5-Customer Rule

The first 5 online customers must:

1. Find Zolto via organic search or content (not ads)
2. Complete onboarding without human help
3. Make their first sale within 14 days
4. Not churn within 30 days
5. Generate at least one support ticket (validates AI chatbot)

If this doesn't happen, fix onboarding or content before scaling.

---

## 6. Operations (AI-Run Model)

### 6.1 AI-Run Operations Map

| Function                 | AI Tool                                       | Human Touchpoint                                                                            |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Customer support         | AI chatbot (trained on docs + iteration logs) | Escalation for billing/bugs only                                                            |
| Onboarding               | Automated email + in-product guidance         | None for standard setup                                                                     |
| Content creation         | AI-assisted blog, social, email               | Review and publish                                                                          |
| Pricing optimization     | A/B test analysis                             | Set price floors                                                                            |
| Feature prioritization   | Usage data + ticket analysis                  | Final decisions                                                                             |
| Feature _implementation_ | AI drafts code from request                   | **Human reviews + merges** — mandatory for any change to billing, auth, or tenant isolation |
| Sales                    | Self-serve checkout + AI demo                 | None for Entry tier                                                                         |
| Billing                  | Automated invoicing, dunning                  | Disputes only                                                                               |

### 6.2 Success Metrics Dashboard

| Metric                    | Source            | Phase 3 Target  | Phase 4 Target |
| ------------------------- | ----------------- | --------------- | -------------- |
| Sign-up rate              | Website analytics | >2%             | >3%            |
| Activation rate           | Product analytics | >30% first sale | >40%           |
| Time-to-first-sale        | Product analytics | <14 days        | <7 days        |
| 30-day churn              | Billing data      | <10%            | <5%            |
| Support ticket resolution | AI chatbot logs   | >70% AI         | >90% AI        |
| SEO traffic growth        | Search Console    | >10% MoM        | >10% MoM       |
| Founder ops time          | Time tracking     | 20 hrs/week     | <5 hrs/week    |

---

## 7. Financial Projections

### 7.1 Assumptions

| Assumption                          | Value                                       |
| ----------------------------------- | ------------------------------------------- |
| Average revenue per customer (ARPA) | €35/month (blended across tiers)            |
| Monthly churn                       | 8% (Phase 3), 5% (Phase 4)                  |
| Customer lifetime (months)          | 12.5 (Phase 3), 20 (Phase 4)                |
| LTV                                 | €438 (Phase 3), €700 (Phase 4)              |
| CAC                                 | €50 (content-driven, organic)               |
| LTV:CAC ratio                       | 8.8:1 (Phase 3), 14:1 (Phase 4)             |
| Displayed prices                    | **No VAT component — under the CHF 100k threshold** |

> **VAT / indirect tax — RESOLVED (owner decision): not applicable at current scale.** Swiss VAT registration is mandatory only once annual turnover exceeds **CHF 100,000** (MWSTG art. 10). Zolto is pre-revenue and far below that, so there is no Swiss VAT to charge on Pro or on the 1% platform fee, prices in `shared/platform.ts` are simply the price (no inclusive/exclusive qualifier needed), and **Stripe Tax stays off**.
>
> **Two triggers that reopen this**, both to watch rather than act on now: (1) annual turnover approaching **CHF 100k** — registration becomes obligatory and every displayed price must then state which way it is quoted; (2) selling subscriptions **into the EU** — EU VAT is a separate regime from the Swiss threshold (B2C digital services fall under the **OSS** scheme at the customer's local rate; B2B is typically reverse-charged with a valid VAT ID), so an EU customer base creates an obligation the CHF 100k exemption does not cover. Zolto currently targets Swiss makers, so this is dormant, not dismissed.

### 7.2 Revenue Trajectory

| Phase              | End of Phase | Customers            | Assumed ARPA | MRR      | ARR         |
| ------------------ | ------------ | -------------------- | ------------ | -------- | ----------- |
| Phase 1 (Month 2)  | Month 2      | 0 (Kalakosh is free) | —            | €0       | €0          |
| Phase 2 (Month 5)  | Month 5      | 5                    | see note     | €45–€175 | €540–€2,100 |
| Phase 3 (Month 9)  | Month 9      | 20                   | €35 blended  | €700     | €8,400      |
| Phase 4 (Month 18) | Month 18     | 80                   | €35 blended  | €2,800   | €33,600     |

> **Phase 2 ARPA reconciliation (fixes the earlier €9-vs-€35 mismatch):** the first 5 customers are **founder-priced at €9/mo**, so the honest Phase 2 exit MRR is **~€45 (5 × €9)**, _not_ €175. The €175 figure only holds if those 5 pay the blended €35 — which contradicts the founder-pricing offer in §4.3. We show the range: €45 if all 5 are on founder pricing, up to €175 if founder pricing has already rolled off to standard tiers by Month 5. Base case: **€45–€90**. Phases 3–4 assume founder discounts have expired and new customers pay blended €35 ARPA.

**Note:** These are estimates, not conservative in every line — the Phase 2 MRR was previously overstated (see reconciliation above). The model assumes organic content drives all acquisition — no paid ads. If content underperforms, the §8.2 kill condition (0 organic sign-ups after 3 months) triggers before this trajectory is reached.

### 7.3 Cost Structure (Lightweight)

| Cost                             | Monthly                    | Notes                      |
| -------------------------------- | -------------------------- | -------------------------- |
| Hosting                          | €50–€200                   | Scales with tenants        |
| OpenAI API                       | €100–€500                  | Scales with chatbot usage  |
| Stripe fees                      | 2.9% + 30¢ per transaction | Passed through or absorbed |
| Founder time                     | €0 (bootstrapped)          | Valued at opportunity cost |
| **Total fixed costs (Month 1)**  | **~€150**                  |                            |
| **Total fixed costs (Month 18)** | **~€700**                  |                            |

---

## 8. Risk Assessment

### 8.1 Risk Matrix

| Risk                                                                                                                                  | Severity | Likelihood | Score | Level     | Mitigation                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kalakosh is a single point of failure** — all Phase 1–3 PMF evidence, content, and GTM depend on one unpaid, voluntary relationship | 5        | 3          | 15    | 🔴 RED    | Line up a **second pilot tenant in parallel** by end of Phase 2 so the content engine and case-study pipeline don't collapse if Sheena/Kalakosh reduces cooperation, gets busy, or renegotiates. Formalize the partnership (see below) so expectations are mutual, not assumed.                                   |
| AI chatbot auto-deploys a bad change to billing/inventory/tenant isolation                                                            | 5        | 2          | 10    | 🟠 ORANGE | **Hard rule: AI drafts, human merges.** No AI-authored change touching payments, auth, or tenant-scoping ships without human review + tests passing. "Auto-deploy" (§6.1, Phase 4) is scoped to cosmetic/content changes only.                                                                                    |
| 0 organic sign-ups after 3 months content                                                                                             | 4        | 3          | 12    | 🟠 ORANGE | Fix SEO/content before any ad spend                                                                                                                                                                                                                                                                               |
| AI chatbot can't resolve >50% of queries                                                                                              | 4        | 3          | 12    | 🟠 ORANGE | Baseline week 1; invest in training if <50%                                                                                                                                                                                                                                                                       |
| Competitor matches AI features                                                                                                        | 3        | 4          | 12    | 🟠 ORANGE | AI is not the moat (see §1.2, §2.3). Defend on maker-first UX + POS/online parity + iteration speed, not on having AI.                                                                                                                                                                                            |
| Kalakosh launch fails (no online store)                                                                                               | 4        | 2          | 8     | 🟡 YELLOW | 6-week deadline; fallback content plan (see §8.3) — publish the "journey" honestly without a live store                                                                                                                                                                                                           |
| Swiss FADP **and** EU GDPR compliance (two regimes, not one)                                                                          | 3        | 3          | 9     | 🟡 YELLOW | Kalakosh + likely early tenants are Swiss → **nFADP/revFADP** applies (differs from GDPR on DPO thresholds, breach notice, register of processing). EU tenants → **GDPR** + DPA. Ship both a FADP-aware and GDPR-aware privacy policy; Stripe handles PCI. Do **not** assume "GDPR-compliant" covers Switzerland. |
| VAT registration missed once a threshold is crossed (CH 100k / EU OSS)                                                                 | 3        | 1          | 3     | 🟢 GREEN  | **Resolved for now** (§7.1): below the CHF 100k Swiss registration threshold, so no VAT applies and Stripe Tax stays off. Residual risk is only *missing the moment it changes* — watch annual turnover against CHF 100k, and re-open if Zolto starts selling into the EU (separate OSS regime).                     |
| Founder time exceeds 10 hrs/week (Phase 4)                                                                                            | 3        | 2          | 6     | 🟡 YELLOW | Automate or hire; red line trigger                                                                                                                                                                                                                                                                                |

### 8.2 The Red Line (Kill Conditions)

| Phase   | Kill Condition                                | Action                                 |
| ------- | --------------------------------------------- | -------------------------------------- |
| Phase 1 | Kalakosh's store doesn't launch after 6 weeks | Pivot to content without live store    |
| Phase 2 | AI chatbot resolves <50% of real questions    | Pause onboarding; retrain chatbot      |
| Phase 3 | 0 organic sign-ups after 3 months of content  | Fix SEO/content before spending on ads |
| Phase 4 | Monthly churn >5% for 3 consecutive months    | Pause growth; fix retention            |
| Anytime | Founder ops time >10 hrs/week after Month 12  | Automate more or hire; model is broken |

### 8.3 Fallback Content Plan (if the Phase 1 kill condition fires)

The default content calendar (§10.2) assumes the launch happens: Launch Diary #2 is "Going Live," #3 is "First Online Order." If Kalakosh's store does **not** go live within 6 weeks, that narrative is unavailable and we must not fake it (see §5.1 authenticity rule). The fallback keeps the content engine running without a live store:

| Planned (launch happens)              | Fallback (no live store in 6 weeks)                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Going Live" — first day, first order | **"What It Actually Takes to Launch"** — an honest teardown of the blockers (photography, catalog, payment setup) that delayed go-live. More relatable, not less. |
| "First Online Order" — the milestone  | **"The Real Cost of Getting a Maker Online"** — time, tooling, decisions. Positions Zolto as the thing that removes those blockers.                               |
| Case study: Kalakosh success          | **Process case study:** the setup journey itself + the iteration log as proof the platform is real and evolving                                                   |

The fallback also **advances the §8.1 mitigation**: it's a forcing function to have a second pilot tenant ready, so we're not narrating a single stalled launch indefinitely.

---

## 9. Phase Roadmap

### Phase 1: Content Engine & Launch Partner (Months 1–2)

**Goal:** Turn Kalakosh's launch journey into discoverable content. Validate the AI-run model.

| Week   | Actions                                                                            | Deliverables                                                  |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Week 1 | Set up Kalakosh online store; configure POS sync; deploy AI chatbot                | Store configured; analytics tracking live                     |
| Week 2 | Photograph workspace; draft Launch Diary #1; record AI walkthrough                 | Launch Diary #1 draft; video recorded                         |
| Week 3 | Store goes live; capture first online order; draft Launch Diary #2                 | Live store; first order; Launch Diary #2                      |
| Week 4 | Publish pricing page with A/B test; publish privacy policy + terms; submit sitemap | Pricing page live; legal pages live; Search Console connected |

**Success Criteria:**

- [ ] Kalakosh online store launched with first online order
- [ ] 3+ content pieces published (Launch Diary series)
- [ ] AI chatbot baseline measured (resolution rate, escalation rate)
- [ ] Pricing page live with A/B test
- [ ] Self-serve sign-up flow end-to-end tested
- [ ] Privacy policy + terms published
- [ ] Content release form signed by Kalakosh
- [ ] First organic visitor (Search Console)

---

### Phase 2: Productize & Automate (Months 3–5)

**Goal:** Turn the Kalakosh launch into a repeatable, AI-run onboarding experience.

| Action                            | Output                                   |
| --------------------------------- | ---------------------------------------- |
| AI-guided onboarding wizard       | New tenants onboard without human help   |
| "Launch in 14 days" template      | Pre-configured store for maker category  |
| AI product description automation | Upload photo → AI generates description  |
| POS-first onboarding flow         | Detects offline sales, enables POS first |
| Milestone celebrations            | "First sale" email + tips                |
| Case study page published         | `/stories/kalakosh-launch` live          |

**Success Criteria:**

- [ ] Onboarding completion rate >30% without human help
- [ ] AI chatbot resolves >70% of support queries
- [ ] 5 customers acquired (founder pricing acceptable)
- [ ] Case study page published and indexed
- [ ] Pricing model validated (at least one customer pays published price)

---

### Phase 3: Acquire & Optimize (Months 5–9)

**Goal:** Get 10–20 online customers via organic content. No paid ads.

| Channel       | Target              | Metric              |
| ------------- | ------------------- | ------------------- |
| SEO content   | 1–2 posts/week      | >500 views/post     |
| Social media  | 3–5 posts/week      | Engagement rate >2% |
| Email nurture | Automated sequences | Open rate >25%      |
| Product-led   | In-app referrals    | Referral rate >10%  |

**Success Criteria:**

- [ ] 10–20 paying customers (organic acquisition only)
- [ ] CAC <€50 (content-driven)
- [ ] Time-to-first-sale <14 days for 80% of customers
- [ ] Monthly churn <10%
- [ ] At least one customer upgraded or expanded
- [ ] Founder ops time <20 hrs/week

---

### Phase 4: Scale the AI Engine (Months 9–18)

**Goal:** Optimize the AI-run machine. Revenue grows; founder time does not.

| Action              | Target                                             |
| ------------------- | -------------------------------------------------- |
| Price increase test | 20–30% increase, <10% churn spike                  |
| Add-on revenue      | AI custom training, advanced analytics             |
| Enterprise tier     | 2+ customers asking for SSO/SLA                    |
| Referral program    | >20% of new customers from referrals               |
| Team hire           | First sales or CS hire if founder >50% time on ops |

**Success Criteria:**

- [ ] 50+ paying customers
- [ ] MRR growth >10% month-over-month
- [ ] Price increase executed with <10% churn spike
- [ ] Founder ops time <5 hrs/week
- [ ] NRR >110%

---

## 10. Appendix

### 10.1 Kalakosh Feature Adoption (Tenant #1 Baseline)

| Feature         | Query                                                                         | What It Tells Us     |
| --------------- | ----------------------------------------------------------------------------- | -------------------- |
| POS sales       | `SELECT COUNT(*) FROM orders WHERE tenant_id = 1 AND channel = 'pos'`         | Core revenue channel |
| Online orders   | `SELECT COUNT(*) FROM orders WHERE tenant_id = 1 AND channel = 'online'`      | Online adoption      |
| Product count   | `SELECT COUNT(*) FROM products WHERE tenant_id = 1`                           | Catalog depth        |
| AI descriptions | `SELECT COUNT(*) FROM products WHERE tenant_id = 1 AND ai_description = true` | AI adoption          |
| Bulk uploads    | `SELECT COUNT(*) FROM bulk_upload_logs WHERE tenant_id = 1`                   | Catalog setup method |
| Staff users     | `SELECT COUNT(*) FROM users WHERE tenant_id = 1 AND role = 'staff'`           | Multi-user setup     |

### 10.2 Content Calendar (Phase 1)

| Week    | Content Piece                          | AI Role                   | Human Role                |
| ------- | -------------------------------------- | ------------------------- | ------------------------- |
| Week 1  | "Launch Diary #1: The Setup"           | Draft from Kalakosh data  | Edit, add photos, publish |
| Week 2  | "Launch Diary #2: Going Live"          | Draft from events         | Edit, add screenshots     |
| Week 3  | "Launch Diary #3: First Online Order"  | Draft from milestone      | Edit, celebrate           |
| Week 4  | Case study page + SEO optimization     | Draft full page           | Review, publish           |
| Ongoing | 1 blog post/week from chatbot insights | Draft from feature builds | Edit, add context         |

### 10.3 Design System: Zolto — "Pearl Jeweller"

> Full spec + copy-paste patterns: [`docs/DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md).
> Source of truth in code: `client/src/index.css` (`--brand-*` hex + `@theme`
> oklch tokens).

The earlier slate/violet "dev-tool" skin is **retired**. The marketing surface
and the merchant/storefront surface now share **one** warm, handcrafted system —
there is zero `slate-*`/`violet-*` left in the app.

```
Brand: Zolto — "AI-run commerce for makers"
Colors (warm; never a cold grey):
  Ground:  #F7F3EE (oyster cream) — page background
  Surface: #EDE7DF / #FAF8F4 / #F0EBE3 (warm ivories)
  Ink:     #2D2620 (warm mahogany) — hero/CTA bands, primary buttons, logo bg
  Text:    #1C1714 (near-black ink) / #6B5E52 (body) / #7A6D65 (captions)
  Accent:  #B8963E (refined gold) — the ONE accent (eyebrows, links, checks)
  Borders: #E0D8CC hairline
  State:   success emerald-500 · attention amber-500 · error rose-600
Typography:
  Serif: Cormorant Garamond (wt 400) — all headings, titles, prices, quotes
  Sans:  Inter (300–600) — body 15px / 1.65, labels, data
  Hand:  Caveat (wt 500) — handwriting accent only
  (headings are serif weight-400 — no bold)
Radius: 0.125rem (near-square)
Components:
  Button (light bg): bg-[--brand-ink] text-white uppercase tracking-[.12em] rounded-md
  Button (dark band): bg-[--brand-accent] text-[--brand-ink]
  Card: bg-white, border-[--brand-border], rounded-lg/xl
  Eyebrow: font-hand gold
  Logo: gold-on-mahogany brush-Z (#B8963E on #2D2620), near-square — never violet
Hand-drawn guardrail:
  Pen allowed on feeling (eyebrows, dividers, hero underlines, illustrations);
  forbidden on information (numbers, money, tables, inputs, status pills, CTAs).
  Reusable ink primitives: components/SketchAccents.tsx.
Animation:
  Fast: 150ms ease-out
```

### 10.4 QA Strategy for AI-Run Model

| Category    | Test Case                                             | Priority |
| ----------- | ----------------------------------------------------- | -------- |
| Unit        | AI description generation returns valid text          | P1       |
| Unit        | POS checkout calculates totals correctly              | P0       |
| Integration | Sign-up → onboarding → first sale E2E                 | P0       |
| Integration | AI chatbot answers 80% of common questions            | P1       |
| Security    | Free tier cannot access paid features                 | P0       |
| Security    | AI-generated content sanitized (no XSS)               | P0       |
| E2E         | Complete purchase flow                                | P0       |
| E2E         | AI onboarding guides to first sale without human help | P1       |

**Quality Gates:**

- 100% P0 test execution
- Pass rate ≥90%
- 0 open P0 bugs
- AI chatbot resolves >70% in test
- Onboarding completion >30% in test cohort

---

> **Prepared by EStore Monetize for Zolto**  
> **Skills applied:** SaaS Metrics Coach, Pricing Strategy, SEO Audit, Legal Risk Assessment, Test Suite Architect, Design System Builder  
> **For questions or revisions:** Update this document in-place. Version history is maintained in the workspace.
