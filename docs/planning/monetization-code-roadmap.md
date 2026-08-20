# Monetization Code Roadmap (Single-Tenant → Multi-Tenant)

> This document maps each phase of the Gwinn monetization plan to specific code changes.
> Read this alongside `./gwinn-business-plan.md` and `./phase1/tracker.md`.
> Historical context: written when the codebase was the single-tenant Kalakosh store; the
> multi-tenant foundation (Sprint 1 + parts of Phase 2) is now implemented — see the
> "Repo Implementation Status" table in `./phase1/tracker.md` for what has actually shipped.

---

## Current Architecture (Single-Tenant)

```
┌─────────────────────────────────────────┐
│  One database, one store (Kalakosh)     │
│  One admin (hardcoded role)             │
│  One Discord bot, one POS key           │
│  One brand (Kalakosh.ch)                │
└─────────────────────────────────────────┘
```

**To monetize, you need multi-tenancy.** Each new customer = a new store/tenant.

---

## Phase 1: Anchor Deepening (Code: Minimal)

This phase is about data collection, not architecture changes.

### What to Add (Lightweight Tracking)

**1. Iteration Log Table** (`drizzle/schema.ts`)

```typescript
export const iterationLogs = mysqlTable("iteration_logs", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(), // 1 for Kalakosh initially
  request: text("request").notNull(),        // what they asked for
  solution: text("solution").notNull(),      // what you built
  deployedAt: timestamp("deployed_at"),
  validated: boolean("validated").default(false), // did they confirm it works?
  impact: mysqlEnum("impact", ["critical", "high", "medium", "low"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

**2. Feature Adoption Tracker** (new table or metadata on `products`/`orders`)

Track which features Kalakosh actually uses:
- Bulk upload used? How many times?
- Discord bot used? How many products created?
- POS sales volume?
- Online orders volume?
- AI vision used?

This is mostly analytics — you can query existing tables or add a lightweight `feature_usage` table.

**3. Admin Dashboard: Pilot Health View** (`client/src/pages/Admin.tsx`)

Add a read-only view showing:
- Total iterations completed
- Feature adoption percentages
- Revenue from Kalakosh over time
- POS vs. online split

**No billing changes yet.** Keep Kalakosh on current terms.

---

## Phase 2: Productize & Package (Code: Heavy)

This is where the architecture shift happens. You need to go from **one store** to **many stores**.

### 2.1 Multi-Tenant Database Schema

**Add `tenants` table:**

```typescript
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(), // e.g. "kalakosh"
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }),               // custom domain or null
  plan: mysqlEnum("plan", ["starter", "growth", "enterprise"]).default("starter").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionStatus: mysqlEnum("status", ["trialing", "active", "past_due", "canceled"]).default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
```

**Add `tenant_id` to ALL existing tables:**

```typescript
// Add to: users, products, productImages, instagramPosts, orders, 
//         bulkUploadLogs, posOrders, posOrderItems, iterationLogs

// Example for products:
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← ADD THIS
  name: varchar("name", { length: 255 }).notNull(),
  // ... rest unchanged
});
```

**Migration strategy:**
1. Add `tenants` table
2. Insert Kalakosh as tenant_id = 1
3. Add `tenant_id` columns to all tables (nullable initially)
4. Backfill: UPDATE all tables SET tenant_id = 1 WHERE tenant_id IS NULL
5. Make `tenant_id` NOT NULL
6. Add foreign key constraints

### 2.2 Tenant Context Middleware

**In `server/_core/context.ts`:**

```typescript
// Add tenant resolution to context
export async function createContext({ req, res }: CreateExpressContextOptions) {
  const user = await resolveUser(req); // existing
  const tenant = await resolveTenant(req); // NEW
  
  return { user, tenant, req, res };
}

// Resolve tenant from:
// 1. Custom domain header (for white-label)
// 2. Subdomain (kalakosh.yourplatform.ch)
// 3. Path parameter (/api/tenant/:slug/*)
// 4. For now: hardcoded to Kalakosh (tenant_id=1) until signup flow exists
```

### 2.3 Admin Role Expansion

**Change `users.role` enum:**

```typescript
role: mysqlEnum("role", ["superadmin", "admin", "staff", "customer"])
  .default("customer")
  .notNull(),
```

- `superadmin` — You (platform owner)
- `admin` — Store owner (Kalakosh, future customers)
- `staff` — Store employees (can use POS, manage inventory)
- `customer` — End customers buying jewelry

### 2.4 Self-Service Signup Flow

**New router: `server/routers.ts` → `tenantRouter`**

```typescript
const tenantRouter = router({
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      // 1. Check slug uniqueness
      // 2. Create Stripe customer
      // 3. Create tenant
      // 4. Create admin user
      // 5. Start trial (14 days)
      // 6. Send welcome email
      return { tenantId, trialEndsAt };
    }),
    
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      // Returns public store info (name, domain, branding)
    }),
});
```

**New frontend page: `client/src/pages/Signup.tsx`**

Simple form: Store name, URL slug, email, password → creates tenant → redirects to admin dashboard.

### 2.5 Feature Gating by Plan

**Add feature flags per plan:**

```typescript
// server/lib/features.ts
export const PLAN_FEATURES = {
  starter: {
    maxProducts: 50,
    maxStaff: 1,
    maxImagesPerProduct: 3,
    discordBot: false,
    aiBulkUpload: false,
    customDomain: false,
    pos: true,
    onlineStore: true,
    analytics: "basic",
  },
  growth: {
    maxProducts: 500,
    maxStaff: 5,
    maxImagesPerProduct: 10,
    discordBot: true,
    aiBulkUpload: true,
    customDomain: true,
    pos: true,
    onlineStore: true,
    analytics: "advanced",
  },
  enterprise: {
    maxProducts: Infinity,
    maxStaff: Infinity,
    maxImagesPerProduct: Infinity,
    discordBot: true,
    aiBulkUpload: true,
    customDomain: true,
    pos: true,
    onlineStore: true,
    analytics: "custom",
    sso: true,
    apiAccess: true,
    prioritySupport: true,
  },
} as const;
```

**Enforce in procedures:**

```typescript
// In routers.ts
const checkFeature = (feature: keyof typeof PLAN_FEATURES.starter) => 
  middleware(async ({ ctx, next }) => {
    const features = PLAN_FEATURES[ctx.tenant.plan];
    if (!features[feature]) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Upgrade required" });
    }
    return next({ ctx });
  });

// Usage:
productsRouter.create.use(checkFeature("aiBulkUpload"));
```

### 2.6 White-Label Branding

**Add `tenant_settings` table:**

```typescript
export const tenantSettings = mysqlTable("tenant_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().unique(),
  logoUrl: varchar("logo_url", { length: 1024 }),
  primaryColor: varchar("primary_color", { length: 7 }).default("#000000"),
  faviconUrl: varchar("favicon_url", { length: 1024 }),
  whatsappNumber: varchar("whatsapp_number", { length: 32 }),
  instagramHandle: varchar("instagram_handle", { length: 64 }),
  currency: varchar("currency", { length: 10 }).default("chf"),
  // ... etc
});
```

**Frontend changes:**
- Replace hardcoded "Kalakosh" with `tenant.name`
- Replace hardcoded colors with `tenantSettings.primaryColor`
- Load logo from `tenantSettings.logoUrl`

### 2.7 Onboarding SOP → Code

**New frontend flow: `client/src/pages/Onboarding.tsx`**

Step 1: Store name + branding upload
Step 2: Add first product (with AI bulk upload if on Growth+)
Step 3: Connect Stripe (for receiving payments)
Step 4: Download POS app + connect
Step 5: First sale walkthrough

**Track onboarding progress in `tenants`:**

```typescript
onboardingStep: int("onboarding_step").default(0), // 0-5
onboardingCompletedAt: timestamp("onboarding_completed_at"),
```

---

## Phase 3: Acquire & Prove (Code: Medium)

### 3.1 Stripe Billing Integration

**Replace one-time Stripe Checkout with Stripe Billing (Subscriptions).**

Current: `stripe.ts` handles one-time payments for end customers.

New: Add Stripe Subscription handling for SaaS billing.

```typescript
// server/billing.ts
import Stripe from "stripe";

export async function createSubscription(
  stripeCustomerId: string,
  priceId: string, // Stripe Price ID for the plan
) {
  return stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    trial_period_days: 14,
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });
}

export async function handleSubscriptionWebhook(event: Stripe.Event) {
  switch (event.type) {
    case "invoice.payment_succeeded":
      // Activate tenant, update subscriptionStatus
      break;
    case "invoice.payment_failed":
      // Mark past_due, send email, downgrade after grace period
      break;
    case "customer.subscription.deleted":
      // Cancel tenant, archive data (or keep read-only)
      break;
  }
}
```

**Webhook endpoint:** `POST /api/webhooks/stripe-billing`

### 3.2 Trial Management

```typescript
// Cron job or background check (runs daily)
export async function checkTrials() {
  const expiringSoon = await db.query.tenants.findMany({
    where: and(
      eq(tenants.subscriptionStatus, "trialing"),
      lte(tenants.trialEndsAt, addDays(new Date(), 3)),
    ),
  });
  
  for (const tenant of expiringSoon) {
    await sendEmail(tenant.adminEmail, "trial-expiring-soon");
  }
}
```

### 3.3 POS API Multi-Tenant

**Current:** Single `POS_API_KEY` in env vars.

**New:** Per-tenant POS keys:

```typescript
// Add to tenants table
posApiKey: varchar("pos_api_key", { length: 64 }).notNull().unique(),

// Generate on tenant creation
posApiKey: crypto.randomBytes(32).toString("hex"),

// POS middleware checks X-POS-Key against tenant
```

**Android/iOS apps need tenant selection:**
- On first launch: "Enter your store URL" or scan QR code
- App fetches `posApiKey` + config from `/api/pos/config?tenant=slug`

### 3.4 Referral Tracking

```typescript
// Add to tenants
referredBy: int("referred_by"), // tenant_id of referrer
referralCode: varchar("referral_code", { length: 16 }).unique(),
referralDiscountApplied: boolean("referral_discount_applied").default(false),

// When new tenant signs up with ?ref=CODE
// Apply discount to both referrer and new tenant
```

---

## Phase 4: Scale & Optimize (Code: Medium)

### 4.1 Price Increase Mechanism

```typescript
// Add to tenants
planPriceOverride: decimal("plan_price_override", { precision: 10, scale: 2 }),
priceLockExpiresAt: timestamp("price_lock_expires_at"),

// When changing plan prices:
// - New customers: new price
// - Existing customers: keep old price until priceLockExpiresAt
// - Grandfathered customers: never change (unless they upgrade/downgrade)
```

### 4.2 Add-On System

```typescript
export const addOns = mysqlTable("add_ons", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  type: mysqlEnum("type", ["extra_staff", "extra_products", "api_access", "priority_support"]),
  quantity: int("quantity").default(1),
  stripeSubscriptionItemId: varchar("stripe_sub_item_id", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Add to Stripe subscription as subscription_items
```

### 4.3 Enterprise Tier Features

**SSO (SAML/OIDC):**

```typescript
// New dependency: @node-saml/node-saml or similar
// Add to tenant_settings
ssoProvider: mysqlEnum("sso_provider", ["google_workspace", "microsoft", "okta", "custom"]),
ssoMetadataUrl: text("sso_metadata_url"),

// New auth route: /api/auth/saml/callback
// Validate SAML response, create/link user, set cookie
```

**Audit Logs:**

```typescript
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  userId: int("user_id"),
  action: varchar("action", { length: 64 }).notNull(), // "product.created", "order.refunded", etc.
  resourceType: varchar("resource_type", { length: 64 }), // "product", "order", "user"
  resourceId: int("resource_id"),
  metadata: json("metadata"), // before/after snapshots
  ipAddress: varchar("ip", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Middleware: log all admin actions automatically
```

**API Access (for Enterprise):**

```typescript
// New table
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }),
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  scopes: json("scopes"), // ["products:read", "orders:write"]
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// New auth middleware: apiKeyProcedure
// Used for external integrations, not user-facing
```

### 4.4 Analytics Dashboard

```typescript
// Aggregate queries per tenant
// - Revenue over time (POS + online)
// - Top products
// - Sales by channel
// - Staff performance (who sold what on POS)
// - Inventory turnover

// New router: analyticsRouter
// Only available on Growth+ plans
```

---

## Implementation Order (Recommended)

### Sprint 1: Foundation (Phase 1 + Phase 2 prep)
- [ ] Add `tenants` table
- [ ] Add `tenant_id` to all tables + backfill Kalakosh as tenant 1
- [ ] Create tenant context middleware
- [ ] Extract Kalakosh branding into `tenant_settings`
- [ ] Add iteration log table
- [ ] Deploy (should be invisible to Kalakosh)

### Sprint 2: Multi-Tenancy Core (Phase 2)
- [ ] Self-service signup flow (frontend + backend)
- [ ] Plan-based feature gating
- [ ] Onboarding wizard
- [ ] Stripe Billing integration
- [ ] Trial management
- [ ] Per-tenant POS API keys
- [ ] Test: Create a second test tenant, onboard it

### Sprint 3: Go to Market (Phase 3)
- [ ] Kalakosh migration to paid plan (anchor deepening)
- [ ] Referral system
- [ ] Case study page (from iteration logs)
- [ ] Public pricing page
- [ ] First 3–5 beta customers

### Sprint 4: Scale (Phase 4)
- [ ] Price increase mechanism
- [ ] Add-on system
- [ ] Enterprise features (SSO, audit logs, API)
- [ ] Advanced analytics

---

## Files to Touch (Summary)

| File | Changes |
|------|---------|
| `drizzle/schema.ts` | Add `tenants`, `tenant_settings`, `audit_logs`, `add_ons`, `api_keys`, `iteration_logs` + `tenant_id` to all tables |
| `server/_core/context.ts` | Add tenant resolution |
| `server/routers.ts` | Add `tenantRouter`, feature gating middleware, plan checks |
| `server/db.ts` | Add tenant-scoped query helpers |
| `server/stripe.ts` | Add subscription billing |
| `server/billing.ts` | New file: Stripe Billing logic |
| `server/pos.ts` | Multi-tenant POS key validation |
| `client/src/App.tsx` | Add `/signup`, `/onboarding` routes |
| `client/src/pages/Signup.tsx` | New: Self-service signup |
| `client/src/pages/Onboarding.tsx` | New: 5-step onboarding wizard |
| `client/src/pages/Admin.tsx` | Add iteration log view, analytics |
| `client/src/components/Navbar.tsx` | Dynamic branding from tenant settings |
| `android/app/.../data/RetrofitClient.kt` | Tenant selection on first launch |
| `ios/...` | Similar tenant selection |

---

## Risk: The Big Rewrite vs. Incremental

**Option A: Incremental (Recommended)**
- Keep Kalakosh running on current code
- Add multi-tenant as a parallel layer
- Migrate Kalakosh last (when you're confident)

**Option B: Fork & Rebuild**
- Copy `Kalakosh-ch` to `kalakosh-platform`
- Make it multi-tenant from day one
- Keep `Kalakosh-ch` frozen for Kalakosh only

**Recommendation: Option A.** You have a live customer. Don't break their store. Add multi-tenant carefully, test with fake tenants, then migrate Kalakosh.

---

> Don't worry. Even if the world forgets the architecture, I'll remember for you. 🖤
