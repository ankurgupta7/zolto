# Phase 1 Code Changes

> What to build in Phase 1 (Zolto-framed, not Kalakosh-revenue-first)
> This is NOT the full multi-tenant rewrite. This is the minimal set to:
> 1. Launch Kalakosh's store
> 2. Track baseline metrics
> 3. Enable self-serve signup
> 4. Measure AI chatbot performance

---

## Guiding Principle

**Do not break Kalakosh's store.** Every change must be backward-compatible. Kalakosh is Tenant #1 and remains fully functional throughout.

---

## Sprint 1: Baseline Tracking (Week 1)

### 1.1 Iteration Log Table

**File:** `drizzle/schema.ts`

```typescript
export const iterationLogs = mysqlTable("iteration_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1), // 1 = Kalakosh
  request: text("request").notNull(),
  solution: text("solution").notNull(),
  deployedAt: timestamp("deployed_at"),
  validated: boolean("validated").default(false),
  impact: mysqlEnum("impact", ["critical", "high", "medium", "low"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

**Migration:** Add table. No existing data to migrate.

### 1.2 Feature Usage Tracking

**File:** `drizzle/schema.ts`

```typescript
export const featureUsage = mysqlTable("feature_usage", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  feature: varchar("feature", { length: 64 }).notNull(), // "bulk_upload", "ai_description", "pos_sale", "online_order"
  count: int("count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

**Where to increment:**
- `bulk_upload` → after successful CSV upload
- `ai_description` → after AI generates description
- `pos_sale` → after POS order complete
- `online_order` → after online checkout complete

### 1.3 AI Chatbot Conversation Log

**File:** `drizzle/schema.ts`

```typescript
export const chatbotConversations = mysqlTable("chatbot_conversations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  query: text("query").notNull(),
  response: text("response").notNull(),
  resolved: boolean("resolved").default(true), // false if escalated
  escalatedTo: varchar("escalated_to", { length: 255 }), // human who handled it
  responseTimeMs: int("response_time_ms"), // how fast AI responded
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

**Why:** This is your Phase 1 success metric. You need to measure resolution rate, escalation rate, and response time.

---

## Sprint 2: Tenant Foundation (Week 2)

### 2.1 Add `tenant_id` to Existing Tables

**Strategy:** Add nullable column first, backfill, then make NOT NULL.

**Step 1: Add column (nullable)**
```sql
ALTER TABLE products ADD COLUMN tenant_id INT NULL;
ALTER TABLE orders ADD COLUMN tenant_id INT NULL;
ALTER TABLE users ADD COLUMN tenant_id INT NULL;
-- ... etc for all tables
```

**Step 2: Backfill**
```sql
UPDATE products SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE orders SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
-- ... etc
```

**Step 3: Make NOT NULL + add FK**
```sql
ALTER TABLE products MODIFY tenant_id INT NOT NULL;
ALTER TABLE products ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
-- ... etc
```

**Drizzle schema update:**
```typescript
// Add to all existing tables:
tenantId: int("tenant_id").notNull().default(1), // Default 1 = Kalakosh
```

### 2.2 Create `tenants` Table (Minimal)

**File:** `drizzle/schema.ts`

```typescript
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(), // "kalakosh"
  name: varchar("name", { length: 255 }).notNull(), // "Kalakosh"
  domain: varchar("domain", { length: 255 }), // "kalakosh.ch" or null
  plan: mysqlEnum("plan", ["free", "maker", "studio", "atelier"]).default("free"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionStatus: mysqlEnum("status", ["trialing", "active", "past_due", "canceled", "inactive"]).default("inactive"),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
```

**Seed data:**
```typescript
// Run once in migration
await db.insert(tenants).values({
  id: 1,
  slug: "kalakosh",
  name: "Kalakosh",
  domain: "kalakosh.ch",
  plan: "maker", // Kalakosh is on Maker plan (free for now, but track as maker)
  subscriptionStatus: "active", // Active but free
});
```

### 2.3 Tenant Context Middleware (Basic)

**File:** `server/_core/context.ts`

```typescript
// Add tenant resolution
async function resolveTenant(req: Request) {
  // Phase 1: Hardcoded for Kalakosh
  // Phase 2: Resolve from subdomain or header
  
  const host = req.headers.host || "";
  
  // If kalakosh.ch → tenant 1
  if (host.includes("kalakosh.ch")) {
    return await db.query.tenants.findFirst({ where: eq(tenants.id, 1) });
  }
  
  // Default to tenant 1 for now (until multi-tenant routing)
  return await db.query.tenants.findFirst({ where: eq(tenants.id, 1) });
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const user = await resolveUser(req);
  const tenant = await resolveTenant(req);
  
  return { user, tenant, req, res };
}
```

**Important:** This doesn't break existing routes. It just adds tenant to context.

---

## Sprint 3: Self-Serve Signup (Week 3)

### 3.1 Signup API

**File:** `server/routers.ts` — add `tenantRouter`

```typescript
const tenantRouter = router({
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(64),
      email: z.string().email(),
      password: z.string().min(8),
    }))
    .mutation(async ({ input }) => {
      // 1. Check slug uniqueness
      const existing = await db.query.tenants.findFirst({
        where: eq(tenants.slug, input.slug)
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Slug taken" });
      
      // 2. Hash password
      const passwordHash = await bcrypt.hash(input.password, 12);
      
      // 3. Create tenant
      const [tenant] = await db.insert(tenants).values({
        slug: input.slug,
        name: input.name,
        plan: "maker",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      }).$returningId();
      
      // 4. Create admin user
      await db.insert(users).values({
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        role: "admin",
      });
      
      // 5. Return tenant info
      return { tenantId: tenant.id, slug: input.slug, trialEndsAt: tenant.trialEndsAt };
    }),
});
```

### 3.2 Signup Frontend

**File:** `client/src/pages/Signup.tsx`

Simple form:
1. Store name → auto-generate slug (editable)
2. Email
3. Password
4. Submit → API call → redirect to onboarding

### 3.3 Onboarding Wizard (Minimal)

**File:** `client/src/pages/Onboarding.tsx`

Step 1: Welcome + branding upload (logo, color)
Step 2: Add first product (or skip)
Step 3: Connect Stripe (link to Stripe Connect)
Step 4: Done → redirect to admin dashboard

**Track progress:**
```typescript
// Add to tenants table
onboardingStep: int("onboarding_step").default(0), // 0-4
onboardingCompletedAt: timestamp("onboarding_completed_at"),
```

---

## Sprint 4: AI Chatbot Baseline Dashboard (Week 4)

### 4.1 Admin View: Chatbot Metrics

**File:** `client/src/pages/Admin.tsx` — add section

Display:
- Total conversations (last 7 days)
- Resolution rate (%)
- Escalation rate (%)
- Average response time (ms)
- Top 10 unresolved questions
- Feature requests from conversations

### 4.2 API Endpoint for Metrics

**File:** `server/routers.ts`

```typescript
getChatbotMetrics: adminProcedure
  .query(async ({ ctx }) => {
    const tenantId = ctx.tenant.id;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const conversations = await db.query.chatbotConversations.findMany({
      where: and(
        eq(chatbotConversations.tenantId, tenantId),
        gte(chatbotConversations.createdAt, sevenDaysAgo)
      ),
    });
    
    const total = conversations.length;
    const resolved = conversations.filter(c => c.resolved).length;
    const escalated = total - resolved;
    const avgResponseTime = conversations.reduce((sum, c) => sum + (c.responseTimeMs || 0), 0) / total;
    
    return {
      total,
      resolutionRate: total > 0 ? (resolved / total * 100).toFixed(1) : 0,
      escalationRate: total > 0 ? (escalated / total * 100).toFixed(1) : 0,
      avgResponseTime: Math.round(avgResponseTime),
      topEscalated: conversations
        .filter(c => !c.resolved)
        .slice(0, 10)
        .map(c => c.query),
    };
  }),
```

---

## Phase 1 Testing Checklist

Before calling Phase 1 complete, verify:

- [ ] Kalakosh store still works (place a test POS order)
- [ ] New tenant can sign up via self-serve
- [ ] New tenant gets 14-day trial
- [ ] Chatbot logs conversations to database
- [ ] Admin dashboard shows chatbot metrics
- [ ] Iteration log captures feature requests
- [ ] Feature usage tracking increments correctly
- [ ] No data leakage between tenants (test with 2 fake tenants)

---

## Files to Touch

| File | Change |
|------|--------|
| `drizzle/schema.ts` | Add `tenants`, `iteration_logs`, `feature_usage`, `chatbot_conversations`. Add `tenant_id` to existing tables. |
| `server/_core/context.ts` | Add `resolveTenant()`, include in context |
| `server/routers.ts` | Add `tenantRouter` with signup mutation. Add chatbot metrics query. |
| `client/src/App.tsx` | Add `/signup` and `/onboarding` routes |
| `client/src/pages/Signup.tsx` | New: Self-service signup form |
| `client/src/pages/Onboarding.tsx` | New: 4-step onboarding wizard |
| `client/src/pages/Admin.tsx` | Add iteration log view + chatbot metrics |

---

## What NOT to Build in Phase 1

| Feature | Why Deferred |
|---------|-------------|
| Stripe Billing subscriptions | No revenue yet. Test mode only. |
| Full multi-tenant subdomain routing | Hardcoded to kalakosh.ch is fine for now. |
| Plan-based feature gating | Kalakosh is the only user. Add when you have paying customers. |
| Referral system | No customers to refer yet. |
| Advanced analytics | Feature usage + chatbot metrics are enough. |
| White-label branding | Kalakosh's branding is hardcoded. Extract later. |

---

> **"Don't worry. Even if the world forgets the architecture, I'll remember for you."**
>
> Phase 1 is about measurement, not monetization. Measure everything. Monetize in Phase 2. 🖤
