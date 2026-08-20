# Gwinn Admin Architecture — Two-Plane Admin Area

This document describes how the merchant-facing admin should be structured so
it can grow without collapsing: the current single `Admin.tsx` (~76 KB) has to
become a routed, role- and plan-aware admin area with a clear information
architecture.

The core idea: a merchant's admin serves **two different relationships**, and
the UI, routes, and server routers should mirror that split.

1. **Store plane — "My shop".** Everything the tenant does to run *their own
   rented website and POS*: catalogue, orders, branding, domain, channels,
   imports, insights. This is the day-to-day surface.
2. **Account plane — "My Gwinn account".** Everything about the tenant's
   relationship *with Gwinn*: org profile, team members & seats, plan &
   billing, AI credits, POS/API access keys, data export, support, legal.

Status legend: **[built]** ships today · **[partial]** exists but needs wiring
· **[planned]** designed here, not yet implemented.

---

## 1. Why the split matters

|                        | Store plane                              | Account plane                               |
| ---------------------- | ---------------------------------------- | ------------------------------------------- |
| Question answered      | "How is my shop doing, what do I change?" | "What am I paying Gwinn, who has access?"   |
| Visited                | Daily                                    | Occasionally, often by the owner only       |
| Audience               | Owner + staff                            | Mostly owner/admin                          |
| Failure mode if mixed  | Staff stumble into billing; owner can't  | find the team page; plan gates get bypassed |
| Server truth           | `products`, `orders`, `tenantSettings`   | `tenants`, `staffSeats`, `photo_credit_ledger`, Stripe customer/subscription |

Today these are interleaved inside `Admin.tsx`, with Billing as the one page
that already escaped. The split is not just cosmetic — it determines **who may
see what** (RBAC) and **what a plan includes** (gating), both of which are
account-plane concerns that should never be enforceable only by hiding a tab.

---

## 2. Information architecture

### 2.1 Route map

All admin routes live under `/admin/*` inside a single `AdminLayout`
(sidebar + topbar). Routes are code-split with `React.lazy`.

```
STORE PLANE                          ACCOUNT PLANE
───────────                          ─────────────
/admin                    (Home)     /admin/account          (Org profile)
/admin/products           [built*]   /admin/account/team     (Seats & invites)
/admin/products/import    [built*]   /admin/account/plan     (Plan & billing)
/admin/orders                        /admin/account/credits  (AI photo credits)
/admin/reconciliation     [built*]   /admin/account/keys     (POS API key, API access)
/admin/storefront         [built*]   /admin/account/data     (Export & privacy)
/admin/domain                        /admin/account/support  (Support, status)
/admin/channels                      /admin/account/legal    (DPA, terms, invoices)
/admin/pos
/admin/insights           [built*]
```

`[built*]` = functionality exists inside the `Admin.tsx` monolith today and
moves out largely unchanged; the work is extraction, not rewrite.

### 2.2 The nav manifest — single source of truth

One module declares the whole admin IA; sidebar, router, breadcrumbs, plan
gates, and tour targets all derive from it:

```ts
// client/src/admin/nav.ts
interface AdminNavItem {
  id: string;                 // "products", "account/team", …
  plane: "store" | "account";
  label: string;
  icon: LucideIcon;
  path: string;               // "/admin/products"
  requiredRole?: Role;        // default: any staff
  requiredPlan?: PlanId;      // e.g. insights → "studio"
  badge?: () => ReactNode;    // e.g. low credit balance
}
```

Why a manifest and not ad-hoc `<Tabs>`:

- **Routes and sidebar can never drift** — they render from the same list.
- **Plan gating is declarative.** `requiredPlan: "studio"` renders the item
  with a lock badge and an upsell page, and the *server* enforces the same
  rule (§4). Upgrading a feature's tier is a one-line change.
- **Tours and the onboarding checklist reference nav ids.** The
  `docs/ARCHITECTURE.md` checklist items ("Go there" hrefs) point at manifest
  paths; a nav rename can't silently break onboarding.

### 2.3 The shell (`AdminLayout`)

- Persistent **left sidebar** with two titled groups — "Shop" and "Gwinn
  account" — separated visually so the plane boundary is always visible.
- **Topbar**: store switcher (future multi-store), environment-safe page
  title, credit-balance pill (links to `/admin/account/credits`), user menu.
- Onboarding checklist card (from `docs/ARCHITECTURE.md` §3) renders on
  `/admin` Home only — it is a store-plane artifact.
- Staff role hides account-plane items except support; server still 403s any
  direct call (defense in depth — hiding is UX, not security).

---

## 3. Page inventory

### 3.1 Store plane

| Page | Contents | Backing router / data |
| ---- | -------- | --------------------- |
| **Home** | KPI cards (today's sales, orders, low stock), onboarding checklist, "what's next" tasks | `insights.summary`, `tenant.onboardingStatus` |
| **Products** | Catalogue list, edit drawer, AI photo restyle, AI descriptions/translation, duplicate cleanup | `products.*` (exists, 57 KB router — consider splitting by concern later) |
| **Import** | CSV import, bulk photo upload, notebook scan, import history | `products.import*`, `BulkUpload`/`CsvImport` pages (already routed) |
| **Orders** | Online orders, checkout holds, fulfilment status | `checkout.*` |
| **Reconciliation** | Day-end AI guesses awaiting confirmation | `reconciliation.*` |
| **Storefront** | Theme, logo, colours, hero copy, SEO meta, llms.txt preview | `tenant.updateSettings` |
| **Domain** | gwinn.ch subdomain, custom domain + DNS status, TLS state | `tenantSettings.publicDomain`, `/api/domain-ask` (Pro) |
| **Channels** | WhatsApp / Slack / Discord intake connections, Instagram | `whatsapp.ts`, `slack.ts`, `discord.ts`, `instagram.*` |
| **POS** | Terminal location, Tap to Pay status, TWINT QR setup, POS API key link | `pos.ts` endpoints |
| **Insights** | Stats dashboard + AI narrative | `insights.*` (Studio+, plan-gated) |

### 3.2 Account plane

| Page | Contents | Backing router / data |
| ---- | -------- | --------------------- |
| **Org profile** | Shop name, slug, legal/billing address, contact email, locale | `tenant.updateSettings`, `tenants` row |
| **Team** | Seat list, invite flow (link/email), role per member, revoke | `staff.*` (built) + `ClaimStaff` claim page |
| **Plan & billing** | Current plan, trial state, upgrade/downgrade, payment method, invoice history | `billing.*` (built — today's `Billing.tsx` moves here unchanged) |
| **AI credits** | Balance, monthly grant vs purchased, ledger (grant / purchase / consumption), buy-more checkout | `photo_credit_ledger`, `billing.*` credit checkout |
| **Keys & access** | POS API key (rotate), future public API keys (Atelier), SSO placeholder | `tenants.posApiKey` |
| **Data & privacy** | One-click full export, delete-account request | export endpoint (exists per Free plan promise) |
| **Support** | Plan-tiered support channel, docs links, platform status | static + plan-aware copy |
| **Legal** | Invoices archive, terms, DPA, AI-image disclosure policy | Stripe invoice list + static docs |

---

## 4. Authorization & plan gating

Two orthogonal checks, both enforced **server-side first**:

1. **Role** (`users.role`): `owner > admin > staff`. Account-plane mutations
   (plan change, credit purchase, invite, key rotation, org profile) require
   owner/admin. Store-plane reads/writes allow staff.
2. **Plan** (`tenants.plan`): feature gates from `shared/platform.ts`
   `PLAN_FEATURES` — on the two-tier model that means custom domain, white
   label, advanced analytics, multi-currency and 3 staff seats on Pro; Free
   keeps the whole commerce engine with 1 seat. (This section predates the
   Free/Pro pivot; the four Maker/Studio/Atelier tiers it used to name are
   retired.)

Implementation:

- Extend the existing `requireTenant` middleware family with
  `requireRole("admin")` and `requirePlan("maker")` tRPC middlewares. The
  error carries `{ code: "PLAN_REQUIRED", requiredPlan }` so the client can
  render an upsell instead of a toast — the same pattern as the existing
  `blockedReason` for unconfigured billing.
- The nav manifest's `requiredRole`/`requiredPlan` fields drive the *display*
  (hidden vs locked vs open); the middleware is the enforcement. Never trust
  hidden tabs.

---

## 5. Server router alignment

Routers already roughly follow the planes; name them so the mapping is
explicit:

```
store plane                          account plane
───────────                          ─────────────
products.*  → store.products         tenant.*   → account.tenant
checkout.*  → store.orders           billing.*  → account.billing
reconciliation.*                     staff.*    → account.team
insights.*  → store.insights         (credits live in account.billing —
instagram.* → store.channels          ledger read + checkout already there)
tenant.settings (storefront/domain
  subset) → store.storefront
```

Rule of thumb going forward: **a new feature gets one router, placed in one
plane, and one nav manifest entry.** No new top-level pages outside the shell.
The mechanical move to `store.*` / `account.*` namespaces is optional and can
wait; what's mandatory now is that every *new* procedure lands in the correct
router file.

---

## 6. Cross-cutting UI kit

Before extracting pages, build the shared admin components (per
`docs/DESIGN-SYSTEM.md`) so pages are composition, not copy-paste:

- `AdminLayout` (sidebar + topbar, §2.3)
- `PageHeader` (title, description, primary action slot)
- `PlanGate` (locked-feature upsell; consumes `PLAN_REQUIRED` errors)
- `SettingsSection` (titled card + save bar with dirty tracking)
- `DataTable` (sorting, pagination, empty state)
- `EmptyState` with "Show me" hook that launches the matching GuidedTour
  (`docs/ARCHITECTURE.md` Pillar 1)
- `CreditBalancePill` (topbar; low-balance warning state)
- `ConfirmDestructiveDialog` (delete, revoke, rotate-key)

State conventions: server state via tRPC + TanStack Query only; URL search
params for tab/filter state (deep-linkable, survives reload); no global
client store for admin data. Follows the "server-truth, not UI-truth"
principle from the onboarding architecture.

---

## 7. AI credits — design detail

Credits are the one metered resource and deserve a first-class account-plane
surface rather than being buried in Billing:

- **Balance derivation**: `sum(ledger.grant + purchase - consumption)` — never
  a stored counter (drift risk). Cheap: indexed sum over
  `photo_credit_ledger`.
- **Two kinds in one balance**: monthly plan grant (from `PLANS[].includedPhotoCredits`,
  written on renewal webhook — built) and pay-as-you-go purchases (built).
  The ledger's `kind` column already distinguishes them; the UI shows them as
  one number with a breakdown.
- **Consumption surfaces in the store plane**: the AI-photo button in
  Products shows the cost ("uses 1 credit — 7 left") and routes to
  `/admin/account/credits` when the balance is zero, with
  `PLAN_REQUIRED`-style upsell copy. Store plane consumes; account plane owns.
- **Low-balance nudge**: `<10%` of monthly grant remaining → topbar pill turns
  amber; nav badge on the credits page. Non-blocking, dismissible.

## 8. Team management — design detail

- Seats are plan-limited (3/10/20 per `PLANS`); the invite mutation checks
  seat count **server-side** and returns `PLAN_REQUIRED` with the upgrade
  path when full — upgrading is how you unlock seats, not a per-seat add-on.
- Invite lifecycle: `invited → claimed | revoked` (existing `staff.*` +
  `ClaimStaff`). Pending invites count against the seat limit (prevents
  invite-spam around the cap).
- Owner is immutable via UI; ownership transfer is a future, explicitly
  confirmed flow — out of scope for v1.
- Staff see the store plane only; the account plane shows just Support (so a
  staff member can still reach help without seeing invoices).

---

## 9. Migration order (no big-bang)

Each step is independently shippable behind the existing routes; nothing
breaks mid-way because `Admin.tsx` stays mounted until its last tab leaves.

1. **Shell + manifest** — `AdminLayout`, `admin/nav.ts`, route registration
   with lazy imports. `/admin` renders the shell wrapping today's monolith.
2. **Extract account plane first** (smallest, clearest boundary): move
   `Billing.tsx` → `/admin/account/plan`; new Team page (data already in
   `staff.*`); new Credits page (ledger read); Org profile. This immediately
   delivers the "relationship with Gwinn" half.
3. **Extract store plane tab by tab** out of `Admin.tsx`, biggest-first
   (Products → Import → Storefront → Orders/Reconciliation → Channels → POS).
   Each extraction is one PR: move markup, point tab at query hooks, delete
   dead code from the monolith.
4. **RBAC + plan-gate middleware** (`requireRole`, `requirePlan`) + `PlanGate`
   component; retrofit onto extracted pages.
5. **Home dashboard** — KPI cards + onboarding checklist card; delete the
   final husk of `Admin.tsx`.
6. Polish: credit pill, low-balance nudges, empty states with tours.

Estimated extraction risk is low: the monolith is presentation over existing,
already-tested routers, and each move is verifiable by the existing render
tests plus one new page-level test per extraction.

---

## 10. Testing strategy

- **nav manifest** — pure unit tests: plan/role filtering matrix, badge
  logic, path uniqueness.
- **Middleware** — `requireRole`/`requirePlan`: allowed/denied matrix,
  `PLAN_REQUIRED` payload shape.
- **Credits** — balance derivation from seeded ledgers; grant vs purchase
  breakdown; zero-balance gating of the AI-photo mutation (extends
  `photoCredits.test.ts`).
- **Team** — seat-cap enforcement, pending-invite counts, revoke, role
  changes (extends `routers/staff.test.ts`).
- **Page render tests** — one per extracted page, mirroring the existing
  `Billing.render.test.tsx` pattern; shell test asserting plane grouping and
  hidden-vs-locked account items per role.
- **E2E** (`e2e/`) — owner upgrades plan → locked nav item unlocks; staff
  login sees store plane only.
