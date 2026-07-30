# Zolto — Planning & Execution Docs

Business strategy, Phase 1 execution kit, and the code roadmap for turning Zolto
from a single-tenant store into a multi-tenant, AI-assisted commerce platform for makers.

These are **planning documents**, not shipped product code. They inform what we build;
the source of truth for what has actually shipped is the code plus the
**Repo Implementation Status** table in [`phase1/tracker.md`](./phase1/tracker.md).

## Contents

| Path | What it is |
|------|-----------|
| [`zolto-business-plan.md`](./zolto-business-plan.md) | The business plan (v1.1). Executive summary, market, pricing, financials, risks, phase roadmap. Start here. |
| [`monetization-code-roadmap.md`](./monetization-code-roadmap.md) | Maps each business phase to concrete code changes (schema, middleware, billing, feature gating). Historical + forward-looking. |
| [`CONTINUE-HERE.md`](./CONTINUE-HERE.md) | **Start here if you're picking up the pricing/agent-commerce work.** Session handoff: the one blocking item, decisions already settled, environment gotchas. Delete once the blocker is closed. |
| [`pricing-pivot-agent-commerce.md`](./pricing-pivot-agent-commerce.md) | **The shipped pricing model.** Free in person forever; 1% platform fee on online + AI-agent orders (Free plan); Pro CHF 25/mo removes it and unmeters AI. Source of truth in code: `shared/platform.ts`. |
| [`feature-backlog-assessment.md`](./feature-backlog-assessment.md) | What we're building from the product backlog and what we're deliberately not. Records the agent-commerce wedge (shipped) and why hyper-local demand intelligence waits for real data. |
| [`honest-pricing-strategy.md`](./honest-pricing-strategy.md) | **Superseded — history only.** The retired four-tier / 0%-take / photo-credit model. Its principles still inform the current pricing; its numbers are obsolete. |
| [`roadmap-backlog.md`](./roadmap-backlog.md) | Founder-captured backlog items not yet scheduled: migrate-in from Shopify/Square/Stripe/Worldline, the founder About page, and a TBD third item. |
| [`phase1/content/about-founder.md`](./phase1/content/about-founder.md) | Draft copy for the casual, first-person founder "About me" page + open questions to finalize it. |
| [`phase1/`](./phase1/) | The Phase 1 execution kit (Content Engine & Launch Partner). |
| [`phase1/tracker.md`](./phase1/tracker.md) | **The living progress tracker.** Task checklists + the ground-truth Repo Implementation Status table. |
| [`phase1/content/`](./phase1/content/) | Launch-diary blog drafts, case study page copy, product photography guide. |
| [`phase1/legal/`](./phase1/legal/) | Privacy policy, terms of service, and the Kalakosh content-release form (get signed before publishing — see below). |
| [`phase1/marketing/`](./phase1/marketing/) | Pricing page copy + A/B plan, SEO keywords, XML sitemap template. |
| [`phase1/code/`](./phase1/code/) | Reference SQL migration + Drizzle schema additions from the original Phase 1 plan. Much of this is now implemented; kept for reference. |

## How to keep this current

When a planned item ships, update the **Repo Implementation Status** table in
[`phase1/tracker.md`](./phase1/tracker.md) — move it to ✅ and note the commit. A planning
doc that drifts from the code is worse than none.

## Two things to know before acting on these docs

1. **Content release is required.** Publishing Kalakosh's name, photos, and story to market
   Zolto needs a signed content/publicity release — Kalakosh being Sheena Arora's business does
   *not* remove that need (Zolto is a separate party). See `zolto-business-plan.md` §5.1 and
   `phase1/legal/content-release-form.md`.
2. **Frontend SaaS pages are on hold.** The signup/onboarding/pricing/legal pages are drafted
   but not built, because the `zolto` client is still a fork of the Kalakosh storefront. They're
   blocked on deciding the marketing-domain-vs-tenant-storefront split. See the tracker's
   "Known blocker" note.

## Excluded from this bundle (on purpose)

- The prior agent's runtime scaffolding (persona/memory/skills/diary files) — not relevant to the repo.
- `zolto-business-plan-ai-readable.json` — it was a machine-readable mirror of the **v1.0** plan and
  contradicts the corrected v1.1 above. Regenerate from the current markdown if a JSON version is needed.
- Original source `.docx`/`.pdf` downloads — superseded by the markdown here.

---

_Business plan v1.1 revision notes are at the top of `zolto-business-plan.md`._
