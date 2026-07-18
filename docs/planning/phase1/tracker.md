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
| [x] Configure POS ↔ online inventory sync | ✅ | Checkout holds — see code section below |
| [x] Set up order notifications (email + WhatsApp to Sheena) | ⚠️ | Email done — see code section below. WhatsApp deferred (needs an approved Cloud API template). |
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
| ✅ Cookie Policy | 🤖 Ready | `phase1/legal/cookie-policy.md` — reflects actual cookie use today (one strictly-necessary session cookie); GA4 analytics cookies flagged as not-yet-installed, to be added with a consent banner when they are. |
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
> Last verified: 2026-07-17 (stood the app up locally — MariaDB + all migrations 0000–0019 + server — and drove every surface in a headless browser).

**Local run-through (2026-07-17):** brought Zolto up end-to-end in the sandbox
(host MariaDB, `.env` with neutral `demo` seed tenant, migrations 0000–0019 applied
cleanly via a local driver over `deploy/lib/db.sh`, a few seeded demo products, dev
server) and screenshotted marketing + storefront + product surfaces. Migration 0019
ran green against a real MySQL for the first time (nullable → backfill → NOT NULL on
all 10 tables, neutral tenant #1). The run surfaced Kalakosh branding still leaking
through the shared chrome the content pass hadn't reached — **now fixed** (commit
`9e60e57`): static `index.html` `<head>` (title/OG/JSON-LD w/ Kalakosh phone+address)
neutralised to Zolto defaults; footer copyright + Instagram now branding-driven and
hidden when a tenant has no handle; shop eyebrow from `branding.storeName`; residual
en/de strings (footer tagline/copyright/swissQuality, product trust-line) genericised.
Verified in-browser: zero Kalakosh strings on any surface.

| Plan item | Planned in | Status in code | Notes |
|-----------|-----------|----------------|-------|
| `tenants` table | Sprint 2 | ✅ Implemented | `drizzle/schema.ts` |
| `tenant_settings` (branding) | Phase 2.6 | ✅ Implemented | incl. `whiteLabelName`, `publicDomain`, `contactEmail`, Discord/Slack channel IDs |
| `iteration_logs` table | Sprint 1 | ✅ Implemented | `drizzle/schema.ts` |
| Tenant context resolution (server) | Sprint 2.3 | ✅ Implemented | `server/_core/context.ts` |
| Self-serve signup **backend** | Sprint 3.1 | ✅ Implemented | `server/routers/tenant.ts`: `create` provisions tenant + settings + Stripe customer + a pending admin, returns a one-time claim token; `claimAdmin` (auth-required) links the signed-in user as admin. Tested (`tenant.test.ts`, 9 cases). Auth is OAuth-only (no password), so the token — not the email — authorizes the claim. |
| Tenant-aware branding (Discord/Slack/WhatsApp/email) | Phase 2.6 | ✅ Implemented | commit `1c5db74`; beyond original Phase 1 scope |
| **Hostname surface split** (marketing vs storefront) | new | ✅ Implemented | `client/src/lib/surface.ts` + `App.tsx`; apex→marketing, subdomain→storefront, `?surface`/`?tenant` dev overrides |
| **Storefront theming from `tenant_settings`** | Phase 2.6 | ✅ Implemented | Kalakosh palette → CSS vars (`--brand-*` in `index.css`); `TenantContext` injects `--brand-ink` from `primaryColor`; chrome (Navbar/Footer/WhatsApp) reads name/contacts/logo from branding. Non-Kalakosh tenants get neutral defaults (no borrowed contacts). |
| Signup **frontend** (`Signup.tsx`) | Sprint 3.2 | ✅ Implemented | `client/src/marketing/pages/Signup.tsx`, wired to `tenant.create` |
| Onboarding wizard (`Onboarding.tsx`) | Sprint 3.3 | ⚠️ Partial | `client/src/marketing/pages/Onboarding.tsx` — client-side checklist; **not yet persisted** (`onboardingStep` column exists but no mutation) |
| Pricing page | Week 4 | ✅ Implemented | `client/src/marketing/pages/Pricing.tsx` from `marketing/pricing-page-copy.md` |
| Platform legal pages (Zolto ToS/Privacy) | Week 4 | ✅ Implemented | `client/src/marketing/pages/Legal.tsx` (/legal/privacy, /legal/terms). Storefront still uses tenant's own AGB (`pages/Policy.tsx`). |
| Chatbot metrics dashboard | Sprint 4 | ❌ Not built | — |
| `feature_usage`, `chatbot_conversations` tables | Sprint 1 | ❌ Not built | Verified absent from `drizzle/schema.ts`; required before the chatbot metrics dashboard |

**Deployment direction (decided 2026-07-16): Option A — standalone Zolto.**
Zolto runs as its own deployment (own server + DB) onboarding new stores; the live
Kalakosh store stays on the separate Kalakosh-ch codebase, untouched. Kalakosh-ch
is single-tenant (no `tenant_id`) — running 0019 against its DB while it runs
single-tenant code would break every insert, so that is explicitly out of scope.
A future Kalakosh→Zolto cutover is possible later via 0019's `SEED_TENANT_SLUG`/
`POS_API_KEY` path (see `deploy/MIGRATION-0019-RUNBOOK.md` Case B). Consequent changes:
migration 0019 now seeds tenant #1 as a neutral `platform` tenant (not Kalakosh);
client default tenant slug is `demo` (was `kalakosh`).

**Resolved blocker (was: Kalakosh-forked client):** the marketing-vs-storefront split is now built (hostname-aware, same app). The storefront themes itself from `tenant_settings`; the Zolto marketing surface (`/`, `/pricing`, `/signup`, `/onboarding`, `/legal/*`) has its own slate+violet identity. Kalakosh stays pixel-identical via per-tenant defaults.

**Flow walkthrough (2026-07-17):** drove signup, cart/checkout, and the admin
side in a headless browser against the local instance. Findings + fixes:
- ✅ **Signup was broken end-to-end (commit `5c0eb0e`).** `tenant.create` provisioned the tenant then failed inserting the pending admin: `openId = "pending:" + claimToken` was 72 chars but `users.openId` is varchar(64), so strict-mode MySQL rejected it — the unit tests mocked the db and never caught it. Fixed by shrinking the token to 24 bytes (48 hex, `pending:`+token = 56 ≤ 64) + a regression assertion. Verified: signup now provisions tenant + settings + pending admin and lands on onboarding.
- ✅ **Cart/checkout works.** Added 2 pearls → cart drawer → checkout; subtotal, Swiss shipping, and the Stripe-off WhatsApp fallback all render correctly (the actual Stripe redirect needs test keys, so the fallback is the reachable path).
- ✅ **Tenant isolation was broken — fixed (commit `c91f6d2`).** Product reads/mutations weren't tenant-scoped: every storefront's `products.list` returned *all* tenants' products, and a store's admin could view/delete another store's catalogue. Now every product read/write is scoped by tenant at the db layer (required `tenantId` arg), storefront reads via `ctx.tenant` (client sends `x-tenant-slug`; server warms the DB at boot so resolution works cold), admin via `ctx.user.tenantId`. Verified in-browser: perlen's admin went from 11 products / CHF 9767 (both tenants) to its own 6 / CHF 6060.

**Follow-ups:**
- ✅ **Isolation pass extended to the remaining tables (2026-07-17, commit `a50edb5`).** `instagram_posts` (list scopes to `ctx.tenant`; add/delete/reorder to `ctx.user.tenantId`), `getPaidOrders(tenantId)` (admin insights), `getBulkUploadLogs(tenantId)`. `getOrderBySessionId`/`updateOrderBySessionId` stay keyed by the globally-unique Stripe session id (webhook has no tenant in context; documented). POS order reads are keyed by unique payment-intent/order ids, so no leak. New `server/routers/instagram.test.ts`. **Still open:** the Stripe **reconciliation** job scans one Stripe account globally and matches against the default tenant — needs per-tenant Stripe accounts first.
- ✅ **Signup claim round-trip wired (2026-07-17, commit `56fc099`).** OAuth now admits any Google account (ADMIN_EMAIL = platform admin; others sign in as `user`), preserves a returning store admin's earned role/tenant, and carries a validated `next` back to the claim step. Onboarding's `ClaimStep` redeems the stashed token via `tenant.claimAdmin` once signed in. Verified end-to-end in-browser: a maker flips from `user`/tenant-1 to `admin`/their tenant and the pending row is burned. Remaining niceties: persist onboarding progress; on first login a brand-new (pre-claim) user still gets placeholder `tenantId = 1`.
- Persist onboarding progress (add a `tenant.updateOnboardingStep` mutation; wire the wizard to it).
- ✅ **Done (2026-07-17, commit `f9fb346`):** derive the dark half of the palette (ink family + a same-hue accent) from a single tenant `primaryColor` via `client/src/lib/palette.ts` (`derivePalette`, unit-tested); `TenantContext` applies every derived `--brand-*`. Cream surfaces stay default → "<brand color> + cream". Verified in-browser with a navy pearl tenant (`#1e3a5f` → mid-blue accent `#367ad3`). Remaining nuance: the cream *surface* tints are still fixed (not re-toned per hue) — fine for now.
- Storefront content is now generic templates (done), and the shared chrome + static SEO shell were de-Kalakosh'd on 2026-07-17 (commit `9e60e57`). Remaining: the `home.*`/`about.*`/`contact.*`/`shop.*` locale keys with Kalakosh copy are now **dead** (their pages were rewritten to `storefrontContent.ts`/branding and no longer read them) — cosmetic cleanup, not a leak. Deep per-tenant *authored* content (a CMS) remains out of scope.
- POS routes still missing from the multi-tenant refactor (receipts, sales list, invoices, send/save-receipt, recategorize, connection-token) — reference impls in Kalakosh-ch.
- ✅ **Task 7 — POS ↔ online inventory sync (2026-07-18).** The gap: both channels already wrote to the same tenant-scoped `products.quantity`/`sold` at *fulfillment* time (`markProductsSold`, shared by `server/pos.ts` and `server/stripe.ts` `fulfillOrder`), but nothing reserved stock while an online Stripe Checkout Session was open — a POS cashier could sell the last unit of a piece to a walk-in customer while an online buyer was mid-checkout for the same piece. Fixed with a short-lived checkout hold: `products.reserved_until`/`reserved_token` (migration 0021, `migrate_0021_product_reservations` in `deploy/lib/db.sh`, tested in `deploy/lib/product-reservation-migration.test.sh`). `checkout.createSession` calls `reserveProducts` (server/db.ts) before creating the Stripe session — an atomic conditional UPDATE guarded by a random per-call token so concurrent reservations can't race each other — and releases the hold if reservation fails, Stripe errors, or order persistence fails. The Checkout Session's `expires_at` is pinned to 30 minutes (Stripe's own minimum), matching the hold's TTL, so a hold self-heals even if a webhook never fires. `checkout.session.expired`/`async_payment_failed` webhook events also explicitly release the hold (`server/stripe.ts`). POS's `resolveSaleLineItems` and `GET /api/pos/products` now exclude actively-reserved pieces, so the register can't sell — or even list — something mid-online-checkout. `markProductsSold` clears any hold on final sale. Tests: `server/db.test.ts` (reserveProducts/releaseProductReservations), `server/checkout.test.ts` (hold-then-checkout, partial-failure release, Stripe/DB-failure release, expires_at), `server/stripe.test.ts` (webhook release), `server/pos.test.ts` (POS excludes reserved pieces, allows through once expired). **Known limitation (accepted tradeoff, documented in code):** release is unconditional by product id (no per-order ownership check) — a third party re-reserving the exact same piece in the narrow window between an early webhook release and the hold's own TTL expiry is not guarded against; deemed not worth per-order token tracking given the short TTL and low traffic. Also: a customer who abandons and retries checkout for the same cart within the 30-minute window will hit "Someone else is already buying" (their own earlier hold) — no session-ownership tracking, so this is a rough UX edge rather than a correctness bug.

- ⚠️ **Task 8 — order notifications, email portion done (2026-07-18).** `notifyOwner` (Discord DM) was never tenant-aware — it always messages one global `DISCORD_OWNER_USER_ID`, so in a multi-tenant world every store's paid order would DM the same person regardless of which tenant it belonged to (left as-is; out of scope here, called out as pre-existing debt). Added a second, tenant-aware channel alongside it: `getTenantAdminContact(tenantId)` (server/db.ts) resolves the earliest `role='admin'` user row for the tenant (works even pre-claim, since `createPendingTenantAdmin` already stores a real email on that row); `server/stripe.ts` `fulfillOrder` now also emails that address via a new `sendOwnerOrderEmail`/`buildOwnerOrderNotificationHtml` (server/_core/email.ts) — owner's name from `users.name`, falling back to the tenant's store name if the admin hasn't completed OAuth claim yet (name is null pre-claim). Fire-and-forget with a logged catch, matching the existing Discord/receipt-email pattern; a missing admin or a Resend failure never blocks order fulfillment. Tests: `server/db.test.ts` (getTenantAdminContact), `server/_core/email.test.ts` (buildOwnerOrderNotificationHtml/sendOwnerOrderEmail), `server/stripe.test.ts` (email sent with admin's name / falls back to store name / skipped when no admin / doesn't throw on failure). **WhatsApp deferred by design decision, not an oversight:** `tenant_settings.whatsappNumber` is a customer-facing click-to-chat number only — `server/whatsapp.ts` has no outbound-sending code at all (webhook receiver + inbound media download only), and Meta requires a pre-approved message template for any business-initiated WhatsApp message outside a 24h customer-reply window. Shipping that needs a template registered in Meta Business Manager first, so it's follow-up work, not bundled into this change. **Also out of scope:** POS sales don't trigger any owner notification (online-only, matching the existing single `notifyOwner` call site) — Sheena is physically present for those, so lower priority.

**Infra gaps discovered during the server tsc fix (2026-07-16):**
- ✅ **Multi-tenant DB migration — WRITTEN (migration 0019).** `tenant_id` and the tenant tables existed only in `drizzle/schema.ts`, never in any migration. Fixed: `migrate_0019_multitenant()` in `deploy/lib/db.sh` (called from `update.sh` after 0018) creates `tenants`/`tenant_settings`/`iteration_logs` (+ enterprise stubs `audit_logs`/`api_keys`/`add_ons`), seeds tenant #1, and adds `tenant_id` to all 10 tenant-scoped tables (nullable → backfill `=1` → NOT NULL). Idempotent; no FK/index (schema declares none). Tested without a DB via `deploy/lib/tenant-migration.test.sh` (fresh + already-migrated + POS-key scenarios, 41 assertions), wired into `npm run test:deploy-scripts`.
  - **Dry-run tooling ready:** `deploy/inspect-db.sh` (read-only pre-flight for the live server) + `deploy/dry-run-migration.sh` (runs 0019 twice against a mysqldump in a throwaway container, verifies NOT NULL/backfill/row-counts/idempotency). Operator steps in `deploy/MIGRATION-0019-RUNBOOK.md`.
  - ✅ **Dry-run executed (2026-07-17):** 0019 ran cleanly against a real MariaDB in the sandbox (fresh DB, not a prod dump) — all six tenant tables created, `tenant_id` added + backfilled + set NOT NULL on all 10 tables, neutral tenant #1 seeded, re-run idempotent. Confirms the SQL is valid MySQL; a prod-dump dry-run per the runbook is still the gate before touching a live DB.
  - ⚠️ **Not yet deployed to any live store. Must run against a copy of the production DB first.** It touches the LIVE store's payment/inventory tables. Two live-store notes baked into the migration: (1) tenant #1's `pos_api_key` is seeded from `$POS_API_KEY` so the POS terminal (which authenticates purely by that key, no fallback) keeps working — if `POS_API_KEY` is unset the seed uses a placeholder and warns; (2) `drizzle/*.sql` (the `db:push` path) is a *separate* migration history that also lacks these changes — `update.sh` is authoritative per `.tasks.json`, so `db:push` should not be used on this DB.
- ✅ **34 server test failures — FIXED.** Root cause was deeper than mocks: the multi-tenant refactor had **gutted `pos.ts`**, deleting the payment-intent / twint-intent / manual-sale / sale routes and leaving a "the rest would be updated similarly" stub — so the POS backend literally couldn't take a payment (all those routes 404'd). Fixed by (a) extracting POS auth into `getTenantByPosApiKey()` in `db.ts` and mocking that (fixes the auth path cleanly), and (b) **re-implementing the 4 deleted routes**, tenant-scoped, using the surviving helpers (`resolveSaleLineItems`/`createPosOrder`/`fulfillPosOrder`). Reconciliation test updated to the real admin-guard message (`NOT_ADMIN_ERR_MSG`). Full suite: **305 passed, 0 failed**.
  - ⚠️ **`pos.ts` is still missing routes the refactor also deleted** (not test-covered, so left for later): sales list, invoices, send-receipt, save-receipt, receipt view, recategorize, connection-token. The orphaned `generateReceiptHtml` + unused imports in `pos.ts` are the remnants of these. Reference implementations exist in the Kalakosh-ch repo (`server/pos.ts`) to port when prioritized. No CI runs biome, so the dead-code lint warnings don't block.

**Server tsc: 21 → 0 (done).** Root cause was the schema making `tenant_id` NOT NULL while insert callsites never supplied it. Fixed by threading a configurable `DEFAULT_TENANT_ID` (env-overridable, default 1) through the `db.ts` helper layer (`server/_core/tenant.ts`); request-scoped/tenant-aware callers can still pass an explicit id. Also added `upsert_images` to the `bulk_upload_logs.operation` enum (+ `update.sh` migration 0018).

---

> Keep this file current: when a plan item ships, move it from ❌/⚠️ to ✅ and note the commit. The tracker is only useful if it matches the code.
