# Phase 1 Implementation Tracker

> Content Engine & Launch Partner (Months 1–2)
> Goal: Turn Kalakosh's launch journey into discoverable content. Validate the AI-run model.
> 
> **Content release IS required.** Kalakosh being owned by Sheena Arora does not remove the need — Zolto is a separate party commercially using her name, likeness, and story to market to other customers. Get a signed content/publicity release (and a lightweight pilot-partnership agreement) before publishing the Launch Diary series. See `phase1/legal/content-release-form.md`.

---

## Legend

| Owner | Meaning |
|-------|---------|
| 🤖 AI | I generated this for you. Review, edit, use. |
| 👤 YOU | You need to do this. I can't access your systems/camera/store. |
| 🤝 BOTH | We collaborate — I draft, you execute. |

---

## Week 1: Launch Setup

### Store Configuration (👤 YOU)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Upload Kalakosh products to online store | ❌ | Start with 10–20 hero products, not full catalog |
| [ ] Configure product categories (necklaces, earrings, bracelets, pearls, semi-precious) | ❌ | Match Sheena's market organization |
| [ ] Set up AI-generated product descriptions | ❌ | Use existing AI tool. Batch generate for uploaded products. |
| [ ] Add product photos (high quality, consistent lighting) | ❌ | See `phase1/content/photo-guide.md` |
| [ ] Configure shipping rules (CH domestic: CHF 8, EU: CHF 15) | ❌ | Start simple: flat rate per region |
| [ ] Connect payment (Stripe) for online orders | ❌ | Test mode first, then live |
| [ ] Configure POS ↔ online inventory sync | ❌ | Critical: one inventory, two channels |
| [ ] Set up order notifications (email + WhatsApp to Sheena) | ❌ | Simple: new order → email + WhatsApp |
| [ ] Test checkout end-to-end (place test order, verify flow) | ❌ | Do this before going live |

### AI Chatbot Baseline (🤝 BOTH)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Deploy AI chatbot with basic training | 👤 | Already deployed per your context |
| [ ] Run 1-week conversation audit | 👤 | Log every chat: query, resolution, escalation |
| [ ] Calculate baseline metrics | 🤖 | Use tracker below. I provide formula. |
| [ ] Document top 10 unresolved questions | 🤝 | AI analyzes logs, you categorize |

**Baseline Metrics Tracker (log for 7 days):**

| Date | Total Queries | Resolved by AI | Escalated to Sheena | Feature Requests | Avg Response Time |
|------|--------------|----------------|-------------------|------------------|-------------------|
| Day 1 | | | | | |
| Day 2 | | | | | |
| ... | | | | | |
| **Week Total** | | | | | |

**Resolution rate** = Resolved by AI / Total Queries × 100  
**Escalation rate** = Escalated to Sheena / Total Queries × 100

### Analytics Setup (👤 YOU)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Install Google Analytics 4 on store + marketing site | ❌ | Track: sign-ups, activations, sales |
| [ ] Set up Google Search Console for zolto.com + kalakosh.ch | ❌ | Submit sitemap after launch |
| [ ] Configure conversion events (first sale, signup, checkout complete) | ❌ | Custom events in GA4 |
| [ ] Set up Stripe Dashboard for revenue tracking | ❌ | Automatic with Stripe integration |
| [ ] Set up Google Business Profile for Kalakosh (Zurich) | ❌ | Critical for local SEO |

---

## Week 2: Content Creation

### Photography (👤 YOU)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Photograph Kalakosh workspace (wide shot, natural light) | ❌ | See `phase1/content/photo-guide.md` |
| [ ] Photograph 5–10 hero products (white/light background) | ❌ | Focus on pearls and semi-precious stones |
| [ ] Take "before" photo: Sheena at Christmas market / Chilbi (POS in use) | ❌ | Authentic, not staged |
| [ ] Record short video: Sheena describing her craft (30–60 sec) | ❌ | For case study page |
| [ ] Screenshot store backend (AI descriptions, product upload) | ❌ | For Launch Diary posts |

### Content Drafts (🤖 AI — Ready in `phase1/content/`)

| Asset | Status | File |
|-------|--------|------|
| ✅ Launch Diary #1: "The Setup" (Sheena Arora, Zurich, pearls) | 🤖 Ready | `phase1/content/launch-diary-1.md` |
| ✅ Launch Diary #2: "Going Live" (Gold Coast markets, Instagram) | 🤖 Ready | `phase1/content/launch-diary-2.md` |
| ✅ Launch Diary #3: "First Month" (12 orders, CHF 61 AOV) | 🤖 Ready | `phase1/content/launch-diary-3.md` |
| ✅ Case Study Page Copy (Sheena's full story) | 🤖 Ready | `phase1/content/case-study-page.md` |
| ✅ Product Photography Guide | 🤖 Ready | `phase1/content/photo-guide.md` |

### SEO Setup (🤝 BOTH)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Set up URL structure (`/stories/kalakosh-launch`, `/blog/launch-diary-1`, etc.) | 👤 | Implement in your router |
| [ ] Add schema markup (Article + Organization + LocalBusiness for Zurich) | 🤖 | JSON-LD templates provided in content files |
| [ ] Create XML sitemap | 🤖 | Template in `phase1/marketing/sitemap-template.xml` |
| [ ] Set up Google Business Profile for Kalakosh | 👤 | Local SEO critical for "pearl jewelry zurich" |

---

## Week 3: Launch & Document

### Store Launch (👤 YOU)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Switch store from test to live mode | ❌ | Stripe live keys, real shipping rates |
| [ ] Announce launch to Kalakosh's existing customers (Instagram, WhatsApp) | ❌ | Soft launch first |
| [ ] Capture first online order (screenshot, celebrate) | ❌ | This is the milestone moment |
| [ ] Document the first order: product, customer source, time to order | ❌ | For case study |

### Content Publication (🤝 BOTH)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Publish Launch Diary #1 | 🤝 | AI drafted, you add photos + publish |
| [ ] Publish Launch Diary #2 (after going live) | 🤝 | AI drafted, you add screenshots |
| [ ] Publish Launch Diary #3 (after first order) | 🤝 | AI drafted, you add celebration |
| [ ] Share on Kalakosh's Instagram (link to store) | 👤 | Authentic, not promotional |
| [ ] Share in Zurich maker communities | 👤 | Don't spam — share the story |

---

## Week 4: AI-Run Infrastructure

### Self-Serve Setup (👤 YOU)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Build/publish pricing page | 🤝 | Copy ready in `phase1/marketing/pricing-page-copy.md` |
| [ ] Set up self-serve sign-up flow (email → tenant creation → onboarding) | 👤 | Code changes in `phase1/code/` |
| [ ] Connect Stripe Checkout for subscriptions | 👤 | See Stripe docs for subscription mode |
| [ ] Configure Stripe webhooks (subscription created, payment succeeded, failed) | 👤 | Critical for automated billing |
| [ ] Set up trial logic (14 days free, then charge) | 👤 | Gate features by plan after trial |

### Legal Pages (🤖 AI — Ready in `phase1/legal/`)

| Page | Status | File |
|------|--------|------|
| ✅ Privacy Policy | 🤖 Ready | `phase1/legal/privacy-policy.md` |
| ✅ Terms of Service | 🤖 Ready | `phase1/legal/terms-of-service.md` |
| ❌ Cookie Policy | 🤖 Not yet drafted | _Planned — file not created yet. Do not mark ready until it exists._ |
| ⚠️ Content Release Form | 🤝 **Get signed** | `phase1/legal/content-release-form.md` — required before publishing Kalakosh's story (see top-of-file note) |

### Search Console & SEO (👤 YOU)

| Task | Status | Notes |
|------|--------|-------|
| [ ] Submit sitemap to Google Search Console | ❌ | After all pages are live |
| [ ] Verify domain ownership (zolto.com, kalakosh.ch) | ❌ | DNS record or HTML file |
| [ ] Request indexing for key pages (homepage, case study, pricing) | ❌ | Manual request in Search Console |
| [ ] Set up Bing Webmaster Tools (bonus) | ❌ | Lower priority but free traffic |
| [ ] Set up Google Business Profile for Kalakosh | ❌ | Essential for local SEO |

---

## Phase 1 Success Criteria

| Criterion | Owner | Status | Verification |
|-----------|-------|--------|-------------|
| Kalakosh online store launched with first online order | 👤 | ❌ | Live URL + order confirmation |
| 3+ content pieces published (Launch Diary series) | 🤝 | ❌ | Blog posts live on zolto.com |
| AI chatbot baseline measured (resolution rate, escalation rate) | 🤝 | ❌ | 7-day log completed |
| Pricing page live with A/B test | 🤝 | ❌ | zolto.com/pricing accessible |
| Self-serve sign-up flow end-to-end tested | 👤 | ❌ | Test signup → tenant created → onboarding starts |
| Privacy policy + terms published | 🤝 | ❌ | Legal pages live |
| Google Business Profile set up for Kalakosh | 👤 | ❌ | Profile live with Zurich location |
| First organic visitor (Search Console) | 👤 | ❌ | Search Console shows >0 clicks |

---

## Phase 1 Risk: What Could Go Wrong

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Kalakosh's store doesn't launch in 6 weeks | 6-week hard deadline. If not live, publish "journey" content without live store. | 👤 |
| AI chatbot resolves <50% in baseline | Retrain on common questions. Add FAQ about pearls, shipping, sizing. | 🤝 |
| No photos/video of Sheena/Kalakosh | Use product-only shots + anonymized screenshots. Less authentic but workable. | 👤 |
| Stripe setup delayed | Use test mode for Phase 1. Revenue starts in Phase 2 anyway. | 👤 |

---

## Daily Standup Format (Weeks 1–4)

Copy this template daily. Keep it in `memory/2026-07-17.md` or a new daily file.

```
## Day [X] — [Date]

### Yesterday
- [What you did]

### Today
- [What you're doing]

### Blockers
- [What's stopping you]

### Metrics
- Store live: [Yes/No]
- Products uploaded: [N]
- Content published: [N]
- Chatbot queries: [N] resolved: [N] escalated: [N]
- First organic visitor: [Yes/No]
```

---

## Completed (As of Now)

| Item | Status | Location |
|------|--------|----------|
| Database migrations (SQL + Drizzle) | ✅ Done | `phase1/code/migration.sql`, `drizzle-schema-additions.ts` |
| Launch Diary #1 (Sheena Arora, Zurich, pearls) | ✅ Done | `phase1/content/launch-diary-1.md` |
| Launch Diary #2 (Gold Coast, Instagram) | ✅ Done | `phase1/content/launch-diary-2.md` |
| Launch Diary #3 (12 orders, CHF 61) | ✅ Done | `phase1/content/launch-diary-3.md` |
| Case Study Page (full story) | ✅ Done | `phase1/content/case-study-page.md` |
| Photo Guide | ✅ Done | `phase1/content/photo-guide.md` |
| Privacy Policy | ✅ Done | `phase1/legal/privacy-policy.md` |
| Terms of Service | ✅ Done | `phase1/legal/terms-of-service.md` |
| Pricing Page + A/B Test Plan | ✅ Done | `phase1/marketing/pricing-page-copy.md` |
| SEO Keywords + Local SEO (Zurich) | ✅ Done | `phase1/marketing/seo-keywords.md` |
| XML Sitemap | ✅ Done | `phase1/marketing/sitemap-template.xml` |
| Code Changes (Phase 1 scope) | ✅ Done | `phase1/code/phase1-code-changes.md` |

---

## Repo Implementation Status (zolto — branch `claude/agent-context-migration-c2v8mx`)

> Actual state of the code, verified against the repo. This is the ground truth; the checklists above are the plan.
> Last verified: 2026-07-16 (frontend refactor landed).

| Plan item | Planned in | Status in code | Notes |
|-----------|-----------|----------------|-------|
| `tenants` table | Sprint 2 | ✅ Implemented | `drizzle/schema.ts` |
| `tenant_settings` (branding) | Phase 2.6 | ✅ Implemented | incl. `whiteLabelName`, `publicDomain`, `contactEmail`, Discord/Slack channel IDs |
| `iteration_logs` table | Sprint 1 | ✅ Implemented | `drizzle/schema.ts` |
| Tenant context resolution (server) | Sprint 2.3 | ✅ Implemented | `server/_core/context.ts` |
| Self-serve signup **backend** | Sprint 3.1 | ✅ Implemented | `server/routers/tenant.ts` → `tenantRouter.create` (14-day trial, referral codes, POS key gen). NOTE: admin-user creation + Stripe still stubbed (TODOs in file). |
| Tenant-aware branding (Discord/Slack/WhatsApp/email) | Phase 2.6 | ✅ Implemented | commit `1c5db74`; beyond original Phase 1 scope |
| **Hostname surface split** (marketing vs storefront) | new | ✅ Implemented | `client/src/lib/surface.ts` + `App.tsx`; apex→marketing, subdomain→storefront, `?surface`/`?tenant` dev overrides |
| **Storefront theming from `tenant_settings`** | Phase 2.6 | ✅ Implemented | Kalakosh palette → CSS vars (`--brand-*` in `index.css`); `TenantContext` injects `--brand-ink` from `primaryColor`; chrome (Navbar/Footer/WhatsApp) reads name/contacts/logo from branding. Non-Kalakosh tenants get neutral defaults (no borrowed contacts). |
| Signup **frontend** (`Signup.tsx`) | Sprint 3.2 | ✅ Implemented | `client/src/marketing/pages/Signup.tsx`, wired to `tenant.create` |
| Onboarding wizard (`Onboarding.tsx`) | Sprint 3.3 | ⚠️ Partial | `client/src/marketing/pages/Onboarding.tsx` — client-side checklist; **not yet persisted** (`onboardingStep` column exists but no mutation) |
| Pricing page | Week 4 | ✅ Implemented | `client/src/marketing/pages/Pricing.tsx` from `marketing/pricing-page-copy.md` |
| Platform legal pages (Zolto ToS/Privacy) | Week 4 | ✅ Implemented | `client/src/marketing/pages/Legal.tsx` (/legal/privacy, /legal/terms). Storefront still uses tenant's own AGB (`pages/Policy.tsx`). |
| Chatbot metrics dashboard | Sprint 4 | ❌ Not built | — |
| `feature_usage`, `chatbot_conversations` tables | Sprint 1 | ❌ Not built | Verified absent from `drizzle/schema.ts`; required before the chatbot metrics dashboard |

**Resolved blocker (was: Kalakosh-forked client):** the marketing-vs-storefront split is now built (hostname-aware, same app). The storefront themes itself from `tenant_settings`; the Zolto marketing surface (`/`, `/pricing`, `/signup`, `/onboarding`, `/legal/*`) has its own slate+violet identity. Kalakosh stays pixel-identical via per-tenant defaults.

**Follow-ups (tracked, not yet done):**
- Persist onboarding progress (add a `tenant.updateOnboardingStep` mutation; wire the wizard to it).
- Finish signup backend: create the admin user (currently commented out) and the Stripe customer.
- Derive the full warm-neutral palette from a single tenant `primaryColor` (today only `--brand-ink` is tenant-driven; tints keep Kalakosh defaults).
- Deep tenant *content* (FAQ/About/AGB prose) is still Kalakosh-specific by design — a tenant CMS is out of current scope.

**Infra gaps discovered during the server tsc fix (2026-07-16):**
- ✅ **Multi-tenant DB migration — WRITTEN (migration 0019).** `tenant_id` and the tenant tables existed only in `drizzle/schema.ts`, never in any migration. Fixed: `migrate_0019_multitenant()` in `deploy/lib/db.sh` (called from `update.sh` after 0018) creates `tenants`/`tenant_settings`/`iteration_logs` (+ enterprise stubs `audit_logs`/`api_keys`/`add_ons`), seeds tenant #1, and adds `tenant_id` to all 10 tenant-scoped tables (nullable → backfill `=1` → NOT NULL). Idempotent; no FK/index (schema declares none). Tested without a DB via `deploy/lib/tenant-migration.test.sh` (fresh + already-migrated + POS-key scenarios, 41 assertions), wired into `npm run test:deploy-scripts`.
  - ⚠️ **Not yet deployed. Must run against a copy of the production DB first.** It touches the LIVE store's payment/inventory tables. Two live-store notes baked into the migration: (1) tenant #1's `pos_api_key` is seeded from `$POS_API_KEY` so the POS terminal (which authenticates purely by that key, no fallback) keeps working — if `POS_API_KEY` is unset the seed uses a placeholder and warns; (2) `drizzle/*.sql` (the `db:push` path) is a *separate* migration history that also lacks these changes — `update.sh` is authoritative per `.tasks.json`, so `db:push` should not be used on this DB.
- **34 pre-existing server test failures** from the same incomplete multi-tenant work: `server/pos.test.ts` (33 — its `./db` mock predates `pos.ts` using `db.query.tenants` for per-tenant POS keys) and `server/routers/reconciliation.test.ts` (1 — an error-message-string assertion mismatch, unrelated to tenancy). Not introduced by the tsc fix (confirmed by stashed baseline). **Needed:** update the pos test's db mock to provide `query.tenants` + a POS-key/tenant header, and fix the reconciliation test's expected string.

**Server tsc: 21 → 0 (done).** Root cause was the schema making `tenant_id` NOT NULL while insert callsites never supplied it. Fixed by threading a configurable `DEFAULT_TENANT_ID` (env-overridable, default 1) through the `db.ts` helper layer (`server/_core/tenant.ts`); request-scoped/tenant-aware callers can still pass an explicit id. Also added `upsert_images` to the `bulk_upload_logs.operation` enum (+ `update.sh` migration 0018).

---

> Keep this file current: when a plan item ships, move it from ❌/⚠️ to ✅ and note the commit. The tracker is only useful if it matches the code.
