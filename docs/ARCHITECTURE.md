# Zolto Architecture — Tenant Signup & Guided Onboarding

This document describes the **tenant signup tutorial workflow**: a fully
hand-held first-run experience that takes a new merchant from landing page to a
working store. It has three pillars:

1. **Coach-mark overlay** — dimmed page, spotlight on one element, an arrow and
   tooltip telling the merchant exactly where to click next.
2. **Live checklist** — a persistent, server-tracked list of setup tasks that
   shows what's done and what's left, completing in real time as the merchant
   (or the platform) finishes each item.
3. **Tenant provisioning pipeline** — what the platform creates automatically,
   when, and how the checklist observes it.

Status legend: **[built]** ships today · **[partial]** exists but needs wiring
· **[planned]** designed here, not yet implemented.

---

## 1. Journey overview

```
Marketing site                OAuth                 Store admin
─────────────                 ──────                ───────────
 /signup            ──►  /onboarding ──► claim ──►  /admin (guided)
  form fill                wizard        admin        tour + checklist
     │                        │            │               │
     ▼                        ▼            ▼               ▼
 tenant.signup          claim token   tenant.claimAdmin  checklist drives
 (provision batch 1)   in session     (link user↔tenant) remaining
                                                       provisioning
```

**Design principles**

- **Never dead-end the merchant.** Every screen answers "what do I do now?"
  with either an arrow pointing at it or a checked item appearing.
- **Checklist state is server-truth, not UI-truth.** Items complete because a
  real signal exists (a product row, a connected Stripe account, a stored
  Terminal location) — not because the merchant clicked "done". Reloads,
  device switches, and multi-staff shops all see the same state.
- **Provisioning is idempotent and lazy where it can be.** Expensive or
  external steps (Stripe Connect, Terminal Location, custom domain) happen on
  first use, not at signup, and every step is safe to retry.

---

## 2. Pillar 1 — Coach-mark overlay (GuidedTour) [built]

**Components:** `client/src/components/GuidedTour.tsx`,
pure logic in `client/src/lib/tour.ts` (unit-tested in `lib/tour.test.ts`).

```
┌───────────────────────── dimmed page ─────────────────────────┐
│                                                                │
│        ┌──────────────┐                                       │
│        │   target     │  ← spotlight cutout (box-shadow trick) │
│        └──────────────┘                                       │
│              ▲                                                 │
│              └─ arrow (SVG, rotated per placement)             │
│        ┌──────────────┐                                       │
│        │  tooltip:    │  "Click here to add your first        │
│        │  title/body  │   product"  [Back] [Next] [Skip]      │
│        └──────────────┘                                       │
└────────────────────────────────────────────────────────────────┘
```

Mechanics:

- A tour is a list of `TourStep { target: string (CSS selector), title, body,
  placement?: "top" | "bottom" | "left" | "right" }`.
- The overlay measures the target each frame (`requestAnimationFrame`, so it
  tracks scrolling/resizing), spotlights it, and positions the tooltip via
  `computeTooltipPosition` with viewport clamping and arrow rotation.
- Completion is remembered per `tourId` in `localStorage`
  (`tourStorageKey`/`isTourCompleted`/`markTourCompleted`); `autoStart` shows
  it once, `startSignal` re-runs it from a "Replay tour" button.
- Because steps are plain data, **checklist items launch tours**: "Show me how"
  on a checklist row bumps `startSignal` for the tour that covers that task.

**[planned] Tour registry.** Tours should live in one module
(`client/src/lib/tours.ts`) keyed by task id (`add-product`, `connect-stripe`,
…), so the checklist and the "replay" menu share the same definitions, and new
paid-tier features can ship their own tour with the feature.

---

## 3. Pillar 2 — Live checklist [partial → target]

**Today:** `client/src/marketing/pages/Onboarding.tsx` renders a client-side
checklist after signup; progress is **not persisted** (noted in the file's own
comment). `tenants.onboardingStep` (int, default 0) exists in the schema but is
written by nothing.

### 3.1 Target model — checklist as derived server state

Replace the manual counter with a **task list whose completion is computed
from real data**, plus a tiny persisted cursor for "the merchant acknowledged
step N".

```ts
// Conceptual — server/onboarding.ts
interface OnboardingTask {
  id: string;             // "claim-admin" | "add-product" | "connect-stripe" | …
  title: string;          // "Add your first product"
  tourId?: string;        // launches the matching GuidedTour
  href?: string;          // deep link into the right admin screen
  done: boolean;          // ← derived, never stored
}
```

| Task             | Derived from (server)                                   |
| ---------------- | ------------------------------------------------------- |
| Claim admin      | `users.tenantId` set + `role=admin`                     |
| Brand the store  | `tenantSettings.logoUrl` or `primaryColor` set          |
| First product    | ≥1 row in `products` for the tenant                     |
| Connect Stripe   | `tenants.stripeConnectedAccountId` set                  |
| First AI photo   | any `photo_credit_ledger` row `kind='consumption'`      |
| Invite staff     | ≥2 seat rows (Maker+)                                   |
| Custom domain    | `tenantSettings.publicDomain` + DNS check passes        |
| POS ready        | `tenants.terminalLocationId` set (first POS use)        |

API surface (one read, two writes — all `requireTenant` + admin):

- `tenant.onboardingStatus` → `{ tasks: OnboardingTask[], dismissed: boolean }`
  — derives the table above on each call (cheap indexed counts).
- `tenant.dismissOnboarding` → persists `onboardingStep = -1` ("merchant hid
  the checklist"). Repurposes the existing unused column; no migration needed.
- `tenant.setOnboardingCursor(step)` → persists how far the *linear wizard*
  got (`onboardingStep = n`), used only by the post-signup wizard, not the
  admin checklist.

### 3.2 UI behaviour

- The checklist lives as a collapsible card on `/admin` (and full-page on
  `/onboarding`), polling `onboardingStatus` with `refetchInterval` while open
  — so steps the **platform** completes asynchronously (e.g. Stripe Connect
  return webhook) tick themselves off live while the merchant watches.
- Each open task row has two affordances: **"Go there"** (`href`) and
  **"Show me"** (launches the GuidedTour for that task — Pillar 1).
- Done rows collapse into a green summary line; when all tasks are done the
  card auto-dismisses and stores `dismissed`.

**Why derived + cursor instead of stored booleans:** the platform already
knows the truth. Storing per-task flags invites drift (product deleted later,
Stripe disconnected). The only things worth persisting are *dismissal* and the
*wizard cursor* — both are merchant preferences, not facts.

---

## 4. Pillar 3 — Tenant provisioning pipeline

"Provision their tenant side" happens in **three batches**: at signup, at
admin claim, and lazily on first use. Every step is idempotent.

### 4.1 Batch 1 — at `tenant.signup` [built]

Public, unauthenticated (the whole point of self-service):

1. Validate slug uniqueness + plan (= `free`, hard-coded).
2. `createTenant` — row with generated `posApiKey`, `plan='free'`,
   `trialEndsAt = now + 14d`, `subscriptionStatus='trialing'`.
3. `createTenantSettings` — defaults (`currency='chf'`).
4. Create the **Stripe customer** on the platform account
   (`tenants.stripeCustomerId`) — needed later for plan billing and photo
   credit purchases.
5. Return `{ slug, claimToken }` — a one-time token the browser keeps in
   `sessionStorage`. The token, not an email, authorizes the admin claim, so a
   signup can't attach itself to someone else's login.

Failure handling: steps 1–4 run in order; if Stripe customer creation fails
the signup still succeeds and `stripeCustomerId` is back-filled on first
billing interaction (defensive: `billing.createPlanCheckout` already errors
readably when it's missing — [planned] auto-create-and-save instead).

### 4.2 Batch 2 — at `tenant.claimAdmin` [built]

After OAuth login, `/onboarding`'s `ClaimStep` redeems the token exactly once:

1. Token → tenant; set `users.tenantId`, `role='admin'`.
2. Consume the token (single-use).
3. Checklist task "Claim admin" now derives `done=true`; the wizard advances
   the cursor and routes into `/admin` with the guided tour armed.

### 4.3 Batch 3 — lazy, first-use provisioning [built / partial]

These are deliberately NOT done at signup (external calls, cost, or requiring
merchant input):

| Step                       | Trigger                                         | Mechanism                                                                                     |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Stripe Connect account     | Merchant clicks "Connect payments"              | `stripeConnect.ts` onboarding link → return URL → `stripeConnectedAccountId` saved            |
| POS Terminal Location      | First card sale in the POS app                  | `POST /api/pos/terminal/location` collects store address once, creates Location **on the Connect account**, saves `terminalLocationId` |
| Photo-credit bucket        | Plan upgrade / renewal invoice                  | `billing.ts` webhook writes `photo_credit_ledger` `monthly_grant`                             |
| Custom domain + TLS        | Merchant saves domain (Maker+) + DNS propagates | `tenant.updateSettings` gate → `domainStatus` polls DNS → Caddy on-demand-TLS via `/api/domain-ask` |
| Staff seats                | Owner invites from Plan & Billing               | `staff.invite` → claim flow                                                                   |

Each lazy step flips its checklist task to done **by the same derivation
rules in §3.1** — no extra bookkeeping.

### 4.4 Provisioning status surface [planned]

`tenant.onboardingStatus` doubles as the provisioning health endpoint: a task
that is actionable but blocked by missing platform config surfaces
`blockedReason` (e.g. `billingConfigured=false` when `STRIPE_PRICE_*` envs are
unset), so the UI greys the step with an explanation instead of erroring
mid-click. This mirrors what the Billing page already does for plan checkout.

---

## 5. State machines

**Wizard cursor** (`tenants.onboardingStep`): `0 = just signed up → 1 = admin
claimed → 2 = saw first tour → -1 = dismissed/completed`. Monotone except
`-1`; only the two mutations in §3.1 write it.

**Task completion**: pure function of current data; no transitions to guard.

**Claim token**: `issued → redeemed | abandoned` (sessionStorage lifetime).
Single-use; re-signup issues a new one.

---

## 6. Testing strategy

- `lib/tour` — pure position/clamping math (exists).
- GuidedTour — render tests: spotlight target resolution, next/back/skip,
  completion persistence (exists).
- `tenant.onboardingStatus` — derivation matrix: seed minimal rows per task,
  assert done flags; assert `blockedReason` when billing envs absent.
- Wizard — claim-token single-use, cursor advance, reload-resume.
- Lazy provisioning — already covered: `pos.test.ts` (location idempotency,
  connected-account paths), `billing.test.ts` (bucket grants), `domainAsk.test.ts`.

---

## 7. Build order (remaining work)

1. `tenant.onboardingStatus` / `dismissOnboarding` / `setOnboardingCursor` +
   derivation queries (small; unlocks everything else).
2. Checklist card component on `/admin` with polling + per-row "Go there" /
   "Show me".
3. `lib/tours.ts` registry; one tour per remaining task, wired to checklist.
4. Move `/onboarding` wizard onto the server cursor; delete its client-only
   checklist.
5. `blockedReason` surfacing.
