import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { PRODUCT_CATEGORIES } from "../shared/const";

// ═══════════════════════════════════════════════════════════════════════════════
// TENANTS — The root of multi-tenancy
// ═══════════════════════════════════════════════════════════════════════════════

export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(), // e.g. "kalakosh"
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }), // custom domain or null
  plan: mysqlEnum("plan", ["starter", "growth", "enterprise"])
    .default("starter")
    .notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionStatus: mysqlEnum("status", [
    "trialing",
    "active",
    "past_due",
    "canceled",
  ]).default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  posApiKey: varchar("pos_api_key", { length: 64 }).notNull().unique(),
  onboardingStep: int("onboarding_step").default(0), // 0-5
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  referredBy: int("referred_by"), // tenant_id of referrer
  referralCode: varchar("referral_code", { length: 16 }).unique(),
  referralDiscountApplied: boolean("referral_discount_applied").default(false),
  planPriceOverride: decimal("plan_price_override", { precision: 10, scale: 2 }),
  priceLockExpiresAt: timestamp("price_lock_expires_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT SETTINGS — White-label branding per store
// ═══════════════════════════════════════════════════════════════════════════════

export const tenantSettings = mysqlTable("tenant_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().unique(),
  logoUrl: varchar("logo_url", { length: 1024 }),
  primaryColor: varchar("primary_color", { length: 7 }).default("#000000"),
  faviconUrl: varchar("favicon_url", { length: 1024 }),
  whatsappNumber: varchar("whatsapp_number", { length: 32 }),
  instagramHandle: varchar("instagram_handle", { length: 64 }),
  currency: varchar("currency", { length: 10 }).default("chf"),
  // SEO / Meta
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),
  // Branding
  whiteLabelName: varchar("white_label_name", { length: 255 }),
  publicDomain: varchar("public_domain", { length: 255 }),
  // External channel IDs (for multi-tenant bot mapping)
  discordChannelId: varchar("discord_channel_id", { length: 64 }),
  slackChannelId: varchar("slack_channel_id", { length: 64 }),
  // Contact
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 32 }),
  // Social
  facebookUrl: varchar("facebook_url", { length: 1024 }),
  // SSO (Enterprise)
  ssoProvider: mysqlEnum("sso_provider", [
    "google_workspace",
    "microsoft",
    "okta",
    "custom",
  ]),
  ssoMetadataUrl: text("sso_metadata_url"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TenantSetting = typeof tenantSettings.$inferSelect;
export type InsertTenantSetting = typeof tenantSettings.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// USERS — Now scoped to a tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW: every user belongs to a tenant
  openId: varchar("openId", { length: 64 }).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Expanded roles for multi-tenant
  role: mysqlEnum("role", ["superadmin", "admin", "staff", "customer"])
    .default("customer")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  nameEn: varchar("nameEn", { length: 255 }),
  descriptionEn: text("descriptionEn"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: mysqlEnum("category", PRODUCT_CATEGORIES).notNull(),
  imageKey: varchar("imageKey", { length: 512 }),
  imageUrl: varchar("imageUrl", { length: 1024 }),
  visible: boolean("visible").default(true).notNull(),
  sold: boolean("sold").default(false).notNull(),
  quantity: int("quantity").default(1).notNull(),
  source: mysqlEnum("source", ["whatsapp", "manual"])
    .default("manual")
    .notNull(),
  discordMessageId: varchar("discordMessageId", { length: 64 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT IMAGES — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const productImages = mysqlTable("product_images", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  productId: int("productId").notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  imageUrl: varchar("imageUrl", { length: 1024 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductImage = typeof productImages.$inferSelect;
export type InsertProductImage = typeof productImages.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// INSTAGRAM POSTS — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const instagramPosts = mysqlTable("instagram_posts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  postUrl: varchar("postUrl", { length: 1024 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InstagramPost = typeof instagramPosts.$inferSelect;
export type InsertInstagramPost = typeof instagramPosts.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  stripeSessionId: varchar("stripeSessionId", { length: 255 })
    .notNull()
    .unique(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "paid", "failed", "expired"])
    .default("pending")
    .notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerName: varchar("customerName", { length: 255 }),
  amountTotal: int("amountTotal").notNull(),
  currency: varchar("currency", { length: 10 }).default("chf").notNull(),
  productIds: varchar("productIds", { length: 512 }).notNull(),
  paymentMethod: varchar("paymentMethod", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// BULK UPLOAD LOGS — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const bulkUploadLogs = mysqlTable("bulk_upload_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  operation: mysqlEnum("operation", ["analyze", "create", "extra_image"])
    .notNull(),
  ref: varchar("ref", { length: 512 }).notNull(),
  errorMessage: text("errorMessage").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BulkUploadLog = typeof bulkUploadLogs.$inferSelect;
export type InsertBulkUploadLog = typeof bulkUploadLogs.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// POS ORDERS — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const posOrders = mysqlTable("pos_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  invoiceNumber: varchar("invoiceNumber", { length: 32 }).unique(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }).unique(),
  status: mysqlEnum("status", ["pending", "paid", "failed"])
    .default("pending")
    .notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["card", "cash", "twint"])
    .default("card")
    .notNull(),
  totalRappen: int("totalRappen").notNull(),
  customerName: varchar("customerName", { length: 255 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhone: varchar("customerPhone", { length: 32 }),
  receiptUrl: varchar("receiptUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PosOrder = typeof posOrders.$inferSelect;
export type InsertPosOrder = typeof posOrders.$inferInsert;

export const posOrderItems = mysqlTable("pos_order_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  posOrderId: int("posOrderId").notNull(),
  productId: int("productId"),
  name: varchar("name", { length: 255 }),
  priceRappen: int("priceRappen").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PosOrderItem = typeof posOrderItems.$inferSelect;
export type InsertPosOrderItem = typeof posOrderItems.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// RETURNS — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const returns = mysqlTable("returns", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  orderId: int("orderId").notNull(),
  productIds: varchar("productIds", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["requested", "received", "refunded", "rejected"])
    .default("requested")
    .notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  receivedAt: timestamp("receivedAt"),
  refundedAt: timestamp("refundedAt"),
  stripeRefundId: varchar("stripeRefundId", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Return = typeof returns.$inferSelect;
export type InsertReturn = typeof returns.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE RECONCILIATIONS — Scoped to tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const stripeReconciliations = mysqlTable("stripe_reconciliations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 })
    .notNull()
    .unique(),
  amountRappen: int("amountRappen").notNull(),
  currency: varchar("currency", { length: 10 }).default("chf").notNull(),
  stripeCreatedAt: timestamp("stripeCreatedAt").notNull(),
  description: text("description"),
  paymentMethodType: varchar("paymentMethodType", { length: 32 }),
  status: mysqlEnum("status", [
    "pending_review",
    "confirmed",
    "rejected",
    "no_candidates",
  ])
    .default("pending_review")
    .notNull(),
  candidateProductIds: varchar("candidateProductIds", { length: 512 }).notNull(),
  chosenProductId: int("chosenProductId"),
  confirmationToken: varchar("confirmationToken", { length: 128 })
    .notNull()
    .unique(),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StripeReconciliation = typeof stripeReconciliations.$inferSelect;
export type InsertStripeReconciliation =
  typeof stripeReconciliations.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: ITERATION LOGS — Track pilot feedback
// ═══════════════════════════════════════════════════════════════════════════════

export const iterationLogs = mysqlTable("iteration_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  request: text("request").notNull(), // what they asked for
  solution: text("solution").notNull(), // what you built
  deployedAt: timestamp("deployed_at"),
  validated: boolean("validated").default(false), // did they confirm it works?
  impact: mysqlEnum("impact", ["critical", "high", "medium", "low"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IterationLog = typeof iterationLogs.$inferSelect;
export type InsertIterationLog = typeof iterationLogs.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: AUDIT LOGS — Enterprise tier
// ═══════════════════════════════════════════════════════════════════════════════

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  userId: int("user_id"),
  action: varchar("action", { length: 64 }).notNull(), // "product.created", "order.refunded"
  resourceType: varchar("resource_type", { length: 64 }), // "product", "order"
  resourceId: int("resource_id"),
  metadata: json("metadata"), // before/after snapshots
  ipAddress: varchar("ip", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: API KEYS — Enterprise tier
// ═══════════════════════════════════════════════════════════════════════════════

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }),
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  scopes: json("scopes"), // ["products:read", "orders:write"]
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: ADD-ONS — Per-tenant add-on purchases
// ═══════════════════════════════════════════════════════════════════════════════

export const addOns = mysqlTable("add_ons", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  type: mysqlEnum("type", [
    "extra_staff",
    "extra_products",
    "api_access",
    "priority_support",
  ]).notNull(),
  quantity: int("quantity").default(1).notNull(),
  stripeSubscriptionItemId: varchar("stripe_sub_item_id", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AddOn = typeof addOns.$inferSelect;
export type InsertAddOn = typeof addOns.$inferInsert;
