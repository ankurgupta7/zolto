import { mysqlTable, int, text, timestamp, boolean, varchar, mysqlEnum } from "drizzle-orm/mysql-core";

// ============================================
// PHASE 1 MIGRATIONS
// Add to your existing drizzle/schema.ts
// ============================================

// --- NEW TABLES ---

export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }),
  plan: mysqlEnum("plan", ["free", "maker", "studio", "atelier"]).default("free").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionStatus: mysqlEnum("subscription_status", ["trialing", "active", "past_due", "canceled", "inactive"]).default("inactive").notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  onboardingStep: int("onboarding_step").default(0),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const iterationLogs = mysqlTable("iteration_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  request: text("request").notNull(),
  solution: text("solution").notNull(),
  deployedAt: timestamp("deployed_at"),
  validated: boolean("validated").default(false),
  impact: mysqlEnum("impact", ["critical", "high", "medium", "low"]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const featureUsage = mysqlTable("feature_usage", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  feature: varchar("feature", { length: 64 }).notNull(),
  count: int("count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatbotConversations = mysqlTable("chatbot_conversations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  query: text("query").notNull(),
  response: text("response").notNull(),
  resolved: boolean("resolved").default(true),
  escalatedTo: varchar("escalated_to", { length: 255 }),
  responseTimeMs: int("response_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- EXISTING TABLES: ADD tenant_id ---
// Add this column to ALL existing tables that have per-tenant data:
// products, productImages, instagramPosts, orders, orderItems, 
// bulkUploadLogs, posOrders, posOrderItems, users, etc.

// Example for products (add to your existing products table):
// tenantId: int("tenant_id").notNull().default(1),

// Example for users (add to your existing users table):
// tenantId: int("tenant_id").notNull().default(1),

// Example for orders (add to your existing orders table):
// tenantId: int("tenant_id").notNull().default(1),
