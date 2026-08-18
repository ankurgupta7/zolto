import {
  bigint,
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ═══════════════════════════════════════════════════════════════════════════════
// TENANTS — The root of multi-tenancy
// ═══════════════════════════════════════════════════════════════════════════════

export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(), // e.g. "kalakosh"
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }), // custom domain or null
  // Plan ids match the marketing source of truth (shared/platform.ts PLANS):
  // free / pro. Signup defaults to "free". Free carries the 1% platform fee
  // on online/agent orders; Pro removes it (see PLANS[].onlineFeeBps).
  plan: mysqlEnum("plan", ["free", "pro"]).default("free").notNull(),
  // ── Comps: what the platform owner gives this store for nothing ───────────
  // Derived through shared/entitlements.ts, never read raw. `plan` above is
  // what Stripe bills and Stripe writes; these three are what we granted, kept
  // apart so a late `customer.subscription.deleted` can't quietly revoke a comp
  // (and so revoking a comp can't take away something the merchant bought).
  //
  // comp_plan: the plan this store is entitled to without paying — NULL for
  // every ordinary store.
  compPlan: mysqlEnum("comp_plan", ["free", "pro"]),
  // comp_fee_waived: take no platform fee on this store's online/agent orders,
  // whatever plan it is on. Separate from comp_plan because "don't skim this
  // merchant" and "give this merchant Pro" are separate favours.
  compFeeWaived: boolean("comp_fee_waived").default(false).notNull(),
  // Why, in the operator's own words — rendered in the console next to the
  // grant, so a comp found six months later can be judged rather than guessed.
  compNote: varchar("comp_note", { length: 255 }),
  compGrantedAt: timestamp("comp_granted_at"),
  /** users.id of the superadmin who granted it. */
  compGrantedBy: int("comp_granted_by"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  // Stripe Connect (Standard) account for THIS tenant's own storefront
  // checkout — separate from stripeCustomerId/stripeSubscriptionId above,
  // which are Zolto's own billing relationship with the tenant. A tenant's
  // customers pay into stripeConnectedAccountId directly; Zolto never
  // touches that money.
  stripeConnectedAccountId: varchar("stripe_connected_account_id", {
    length: 255,
  }),
  // Stripe Terminal Location id (tml_...) created on the tenant's CONNECTED
  // account for Tap to Pay — one per tenant, provisioned on first POS use
  // (see registerPosRoutes /api/pos/terminal/location). Null until then.
  terminalLocationId: varchar("terminal_location_id", { length: 255 }),
  subscriptionStatus: mysqlEnum("status", [
    "trialing",
    "active",
    "past_due",
    "canceled",
  ]).default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  // SHA-256 hash of the tenant's POS API key — NEVER the plaintext key. The
  // plaintext is shown to the tenant exactly once at generation/rotation
  // (tenant.create / tenant.rotatePosApiKey); auth hashes the presented key
  // and compares (server/db.ts getTenantByPosApiKey). See server/posApiKey.ts.
  posApiKey: varchar("pos_api_key", { length: 64 }).notNull().unique(),
  onboardingStep: int("onboarding_step").default(0), // 0-5
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  referredBy: int("referred_by"), // tenant_id of referrer
  referralCode: varchar("referral_code", { length: 16 }).unique(),
  referralDiscountApplied: boolean("referral_discount_applied").default(false),
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
  // The highlight half of the brand (dividers, eyebrow labels, hover states).
  // Null = derive the accent from primary_color, which is what every store
  // predating this column does. See client/src/lib/palette.ts for why two
  // colors and not one or three.
  secondaryColor: varchar("secondary_color", { length: 7 }),
  // Storefront template chosen at signup (shared/templates.ts). Drives the
  // surface half of the palette; primary_color drives the ink/accent half.
  // Null = the CSS defaults (equivalent to "atelier").
  templateId: varchar("template_id", { length: 32 }),
  faviconUrl: varchar("favicon_url", { length: 1024 }),
  whatsappNumber: varchar("whatsapp_number", { length: 32 }),
  instagramHandle: varchar("instagram_handle", { length: 64 }),
  currency: varchar("currency", { length: 10 }).default("chf"),
  // SEO / Meta
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),
  // Branding
  whiteLabelName: varchar("white_label_name", { length: 255 }),
  // Hide the "Made with Zolto" credit in the storefront footer, its
  // <meta name="generator">, its JSON-LD creator node, /llms.txt and the MCP
  // store info. Only honoured on a white-label plan — shared/attribution.ts
  // owns the gate, and a Free store's `true` here is ignored rather than
  // enforced, so a downgrade restores the credit without a data migration.
  hideZoltoBadge: boolean("hide_zolto_badge").notNull().default(false),
  // ── Merchant-authored storefront content ──────────────────────────────────
  // Every column here is NULL for a store that has written nothing, and NULL
  // means "use the generated template copy" (client/src/lib/storefrontContent.ts)
  // rather than "render an empty page". That is what keeps a store that never
  // opens the Storefront page looking exactly as it did before these existed.
  //
  // The home page's hero background. A hosted URL rather than an upload, to
  // match logo_url on the same admin card.
  heroImageUrl: varchar("hero_image_url", { length: 1024 }),
  // The hero's H1 and the sentence under it. NULL headline falls back to the
  // store name, which is what the hero has always shown.
  heroHeadline: varchar("hero_headline", { length: 120 }),
  heroSubtitle: varchar("hero_subtitle", { length: 300 }),
  // The About page's body, as plain prose. Blank lines separate paragraphs —
  // the page renders each as its own <p>, exactly like the generated copy it
  // replaces. Deliberately not markdown: nothing else in the storefront
  // renders merchant HTML, and keeping it plain text keeps it that way.
  aboutBody: text("about_body"),
  // ── Legal identity, for the storefront's Impressum ────────────────────────
  // The imprint page has always told the merchant they are responsible for
  // adding their company form, registration/VAT numbers and registered
  // address; these are where those go. Public by design — an imprint is a
  // published document, not private data.
  companyLegalName: varchar("company_legal_name", { length: 255 }),
  companyAddress: text("company_address"),
  vatNumber: varchar("vat_number", { length: 64 }),
  companyRegistration: varchar("company_registration", { length: 64 }),
  // The store's custom domain (Pro). Unique because it decides which store a
  // request is served from (server/tenantResolve.ts) — two rows claiming the
  // same hostname means the winner is whichever row LIMIT 1 happens to return.
  // NULL is exempt from a MySQL unique index, so the stores without one (most
  // of them) are unaffected.
  publicDomain: varchar("public_domain", { length: 255 }).unique(),
  // What the merchant sells. `vertical` picks one of shared/verticals.ts
  // VERTICALS (drives category seeding, AI prompt vocabulary, and copy);
  // `verticalDescription` is the merchant's own free-text "what do you sell",
  // interpolated into AI prompts for extra specificity. Defaults to
  // "jewellery" so every pre-existing store keeps its original behaviour.
  vertical: varchar("vertical", { length: 32 }).notNull().default("jewellery"),
  verticalDescription: text("vertical_description"),
  // Where this merchant sold before Zolto (signup's "already selling
  // somewhere?"): 'stripe' | 'sumup' | 'worldline' | 'other', null = fresh
  // start. Drives the onboarding checklist's bring-your-catalogue step
  // (server/onboarding.ts) toward the matching importer.
  migrateFrom: varchar("migrate_from", { length: 16 }),
  // External channel IDs (for multi-tenant bot mapping). These are Discord
  // snowflake IDs, not secrets — the platform's single bot token stays in env
  // (DISCORD_BOT_TOKEN); each tenant just tells us which of THEIR channels the
  // already-installed bot should watch.
  discordChannelId: varchar("discord_channel_id", { length: 64 }),
  // Tenant owner's personal Discord user ID for "new order"-style DM
  // notifications (server/_core/notification.ts). Per-tenant override of the
  // platform-wide DISCORD_OWNER_USER_ID env fallback.
  discordOwnerUserId: varchar("discord_owner_user_id", { length: 64 }),
  slackChannelId: varchar("slack_channel_id", { length: 64 }),
  // The merchant's own TWINT QR code sticker, uploaded as an image and shown
  // full-screen on the POS for the customer to scan. Not a secret (it's a
  // sticker they display physically), so it lives here rather than in
  // tenantSecrets. Null until uploaded, which is what gates the POS's
  // "TWINT (QR)" payment option.
  twintQrUrl: varchar("twint_qr_url", { length: 1024 }),
  // ── Trustpilot ────────────────────────────────────────────────────────────
  // A Trustpilot business unit is identified by the domain it was registered
  // under ("kalakosh.ch"), which is all we need to link a shopper to the
  // store's reviews and to the review form — no API key, no widget script.
  // The live star rating additionally needs the platform's own Trustpilot API
  // key (TRUSTPILOT_API_KEY); without it the storefront shows the link alone
  // rather than nothing, so the feature degrades instead of breaking.
  // NULL = this store has no Trustpilot profile connected, and no part of the
  // trust band renders for it.
  trustpilotDomain: varchar("trustpilot_domain", { length: 253 }),
  // Show the rating on the storefront. Separate from having a domain, because
  // "we are on Trustpilot, and customers who just bought are invited there"
  // and "our score is good enough to print on the home page" are different
  // decisions a merchant makes at different times.
  trustpilotShowRating: boolean("trustpilot_show_rating")
    .notNull()
    .default(true),
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
// TENANT SECRETS — Encrypted vault for tenant-provided credentials
// ═══════════════════════════════════════════════════════════════════════════════
// The ONLY sanctioned home for tenant secrets (a merchant's own provider tokens,
// if a future integration can't use OAuth delegation like Stripe Connect does).
// Ciphertext only — AES-256-GCM against the platform master key in the
// TENANT_SECRETS_KEY env var — so a DB dump or backup never exposes a tenant's
// credentials, and no code path returns plaintext to anyone (including Zolto
// admin). All access goes through server/tenantSecrets.ts.
export const tenantSecrets = mysqlTable("tenant_secrets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(), // "stripe", "discord", "pos", ...
  ciphertext: text("ciphertext").notNull(), // v1:<iv>:<tag>:<data> (hex) — never plaintext
  // Last 4 chars of the secret, stored so the admin UI can show a masked
  // "…3f9a" WITHOUT decrypting. Not reversible.
  hint: varchar("hint", { length: 8 }).notNull(),
  keyVersion: int("key_version").notNull().default(1), // master-key rotation marker
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  rotatedAt: timestamp("rotated_at"),
  lastUsedAt: timestamp("last_used_at"), // audit: last server-side decrypt
});

export type TenantSecret = typeof tenantSecrets.$inferSelect;
export type InsertTenantSecret = typeof tenantSecrets.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// USERS — Now scoped to a tenant
// ═══════════════════════════════════════════════════════════════════════════════

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(), // ← NEW: every user belongs to a tenant
  // UNIQUE, and load-bearing: upsertUser writes every sign-in with
  // onDuplicateKeyUpdate, which in MySQL fires only on a PRIMARY KEY or UNIQUE
  // collision. `id` is autoincrement and never supplied, so without this index
  // there is nothing to collide on and each sign-in INSERTs a fresh row
  // instead of updating one.
  //
  // It was dropped from this file (and from the meta snapshots, at 0004) while
  // the databases kept it, since no generated migration ever emitted the DROP.
  // That divergence is quiet in one direction and destructive in the other:
  // `drizzle-kit generate` compares against the snapshot and stays silent,
  // but `npm run db:sync` (drizzle-kit push --force) reconciles a live
  // database to THIS file and would have removed it.
  openId: varchar("openId", { length: 64 }).notNull().unique(),
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
  // Optional per-locale content (AI-translated via products.translate). The
  // storefront picks the visitor's locale (client/src/lib/localize.ts),
  // falling back to the merchant's primary text in name/description.
  nameDe: varchar("nameDe", { length: 255 }),
  descriptionDe: text("descriptionDe"),
  nameFr: varchar("nameFr", { length: 255 }),
  descriptionFr: text("descriptionFr"),
  nameIt: varchar("nameIt", { length: 255 }),
  descriptionIt: text("descriptionIt"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  // References tenant_categories.key for this tenant (not enforced by FK so
  // renames can cascade in one transaction — see renameTenantCategoryKey).
  category: varchar("category", { length: 64 }).notNull(),
  imageKey: varchar("imageKey", { length: 512 }),
  imageUrl: varchar("imageUrl", { length: 1024 }),
  visible: boolean("visible").default(true).notNull(),
  sold: boolean("sold").default(false).notNull(),
  quantity: int("quantity").default(1).notNull(),
  // Short-lived hold placed while an online Checkout Session for this piece
  // is in flight, so a POS sale (or a second online checkout) can't sell the
  // same one-of-a-kind piece out from under it. reservedToken disambiguates
  // concurrent holds so a stale release can't clear a newer one. See
  // server/db.ts reserveProducts/releaseProductReservations.
  reservedUntil: timestamp("reserved_until"),
  reservedToken: varchar("reserved_token", { length: 32 }),
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
// TENANT CATEGORIES — Per-store product category list
// ═══════════════════════════════════════════════════════════════════════════════
// Seeded from the tenant's vertical preset (shared/verticals.ts) at signup,
// then freely editable by the store admin. `key` is the canonical value stored
// in products.category; the per-language labels (en/de/fr/it) are display-only, so renaming a
// label never touches products (renaming a KEY cascades — see
// server/db.ts renameTenantCategoryKey).

export const tenantCategories = mysqlTable(
  "tenant_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    key: varchar("key", { length: 64 }).notNull(),
    labelEn: varchar("label_en", { length: 64 }).notNull(),
    labelDe: varchar("label_de", { length: 64 }),
    labelFr: varchar("label_fr", { length: 64 }),
    labelIt: varchar("label_it", { length: 64 }),
    // Sibling keys folded into this category's listing when browsing (e.g.
    // jewellery "Sets" surface under both Necklaces and Earrings).
    extraIncludes: json("extra_includes").$type<string[]>(),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("tenant_categories_tenant_key").on(t.tenantId, t.key)],
);

export type TenantCategory = typeof tenantCategories.$inferSelect;
export type InsertTenantCategory = typeof tenantCategories.$inferInsert;

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
  // Storefront language the customer was browsing in when they checked out
  // (de/en/fr/it). Drives the receipt email's language; nullable for orders
  // that predate capture.
  locale: varchar("locale", { length: 5 }),
  // Sales channel: "web" (storefront) or "agent" (AI-agent-originated, e.g.
  // store chat / MCP). In-person sales live in posOrders, so together the
  // three channels are cleanly separable — the pivot's north-star metric.
  channel: mysqlEnum("channel", ["web", "agent"]).default("web").notNull(),
  // Zolto's platform fee (Stripe Connect application fee) taken on this
  // order, in Rappen. 0 on the Pro plan and for pre-pivot orders.
  platformFeeRappen: int("platform_fee_rappen").default(0).notNull(),
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
  operation: mysqlEnum("operation", [
    "analyze",
    "create",
    "extra_image",
    "upsert_images",
  ]).notNull(),
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
  stripePaymentIntentId: varchar("stripePaymentIntentId", {
    length: 255,
  }).unique(),
  // Set instead of the PaymentIntent id for the web till's scan-to-pay sales,
  // which are Stripe Checkout Sessions rather than Terminal PaymentIntents. A
  // session that is still open has no PaymentIntent at all — Stripe creates one
  // only when the customer pays — so `stripePaymentIntentId` cannot be the key
  // these orders are found by. The webhook matches on this column and backfills
  // the PaymentIntent id once `checkout.session.completed` says what it is.
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", {
    length: 255,
  }).unique(),
  status: mysqlEnum("status", ["pending", "paid", "failed"])
    .default("pending")
    .notNull(),
  // Evidentiary grade differs by method and reconciliation depends on telling
  // them apart: `card` and `twint` are gateway-confirmed (a Stripe
  // PaymentIntent succeeded), while `cash` and `twint_qr` are merchant-attested
  // — the cashier counted the money, or watched the payment land in their own
  // TWINT app after the customer scanned their QR sticker. Never collapse
  // `twint_qr` into `twint`; one is proof, the other is a claim.
  paymentMethod: mysqlEnum("paymentMethod", [
    "card",
    "cash",
    "twint",
    "twint_qr",
  ])
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
  candidateProductIds: varchar("candidateProductIds", {
    length: 512,
  }).notNull(),
  chosenProductId: int("chosenProductId"),
  // Nullable, and cleared the moment a decision is recorded: the token is a
  // bearer credential mailed to an inbox, so a spent one must stop being a
  // credential rather than merely stop being accepted.
  confirmationToken: varchar("confirmationToken", { length: 128 }).unique(),
  /** When the mailed link stops working. NULL is treated as expired. */
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StripeReconciliation = typeof stripeReconciliations.$inferSelect;
export type InsertStripeReconciliation =
  typeof stripeReconciliations.$inferInsert;

// ── POS attribution ──────────────────────────────────────────────────────────
// Amount-only POS sales (a market-stall "just enter CHF 50 and tap") are recorded
// as a pos_order with a custom line item that has no productId. This table drives
// the end-of-day pass that guesses which piece each such line was, and emails the
// merchant a one-click confirm link. Unlike stripe_reconciliations, the sale (the
// pos_order) already exists — confirming only *attributes* the line to a product
// and decrements that product's stock; it never creates a new order. Keyed on the
// pos_order_item so each unattributed line is reviewed exactly once, and covers
// cash/TWINT sales too (which have no Stripe payment intent to reconcile against).
export const posAttributions = mysqlTable("pos_attributions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  posOrderId: int("posOrderId").notNull(),
  posOrderItemId: int("posOrderItemId").notNull().unique(),
  amountRappen: int("amountRappen").notNull(),
  status: mysqlEnum("status", [
    "pending_review",
    "confirmed",
    "rejected",
    "no_candidates",
  ])
    .default("pending_review")
    .notNull(),
  candidateProductIds: varchar("candidateProductIds", {
    length: 512,
  }).notNull(),
  chosenProductId: int("chosenProductId"),
  // Cleared on the first decision, same as its Stripe sibling above.
  confirmationToken: varchar("confirmationToken", { length: 128 }).unique(),
  /** When the mailed link stops working. NULL is treated as expired. */
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PosAttribution = typeof posAttributions.$inferSelect;
export type InsertPosAttribution = typeof posAttributions.$inferInsert;

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

// ═══════════════════════════════════════════════════════════════════════════════
// PHOTO CREDIT LEDGER — AI photo generation metering (append-only)
// ═══════════════════════════════════════════════════════════════════════════════
// AI photo generation has a real per-image cost, so it's metered: plans include a
// monthly bucket (shared/platform.ts PLANS[].includedPhotoCredits) and extra
// images are pay-as-you-go (AI_PHOTO_CREDITS, CHF 1/image). The balance is the
// sum of this ledger's deltas for a tenant — grants are positive, consumption
// negative. Append-only so a balance can always be audited back to its source.
export const photoCreditLedger = mysqlTable("photo_credit_ledger", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  // +N on grant (monthly bucket, purchase, manual adjustment), -1 per generated image.
  delta: int("delta").notNull(),
  kind: mysqlEnum("kind", [
    "monthly_grant", // per-billing-cycle plan bucket
    "purchase", // pay-as-you-go pack bought via Stripe Checkout
    "consumption", // one AI image generated
    "manual_adjustment", // operator correction (support gesture, fix)
  ]).notNull(),
  // What this entry came from: a Stripe session/subscription id, a product id,
  // or a free-form note for manual adjustments.
  ref: varchar("ref", { length: 255 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PhotoCreditLedgerEntry = typeof photoCreditLedger.$inferSelect;
export type InsertPhotoCreditLedgerEntry =
  typeof photoCreditLedger.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// STAFF INVITES — pending team seats (plans limit seats: 1/3/10/20)
// ═══════════════════════════════════════════════════════════════════════════════
// A staff seat = a users row with role admin or staff on the tenant. Inviting
// creates a pending row here; each pending invite holds a seat until accepted
// or revoked, so an owner can't over-invite past their plan's seat limit.
export const staffInvites = mysqlTable("staff_invites", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  // Bearer token in the invite link (/claim-staff?token=…), 48 hex chars.
  token: varchar("token", { length: 64 }).notNull(),
  invitedByUserId: int("invited_by_user_id"),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StaffInvite = typeof staffInvites.$inferSelect;
export type InsertStaffInvite = typeof staffInvites.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMIT WINDOWS — shared fixed-window counters (server/rateLimit.ts)
// ═══════════════════════════════════════════════════════════════════════════════
// One row per (limiter, key), e.g. "mcp_checkout:7:203.0.113.9". Replaces an
// in-process Map so the limit holds across every app instance instead of
// resetting per-instance and on every deploy.
export const rateLimitWindows = mysqlTable("rate_limit_windows", {
  id: int("id").autoincrement().primaryKey(),
  limitKey: varchar("limit_key", { length: 255 }).notNull().unique(),
  count: int("count").notNull(),
  // Epoch ms the current window ends — a plain number column (not
  // `timestamp`) because the app does all window-boundary math and compares
  // it directly against `Date.now()`.
  resetAt: bigint("reset_at", { mode: "number" }).notNull(),
});

export type RateLimitWindow = typeof rateLimitWindows.$inferSelect;
export type InsertRateLimitWindow = typeof rateLimitWindows.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE OBJECTS — per-tenant ledger of what each tenant has stored
// ═══════════════════════════════════════════════════════════════════════════════
// The plan cards sell "5 GB" (Free) and "50 GB" (Pro) of photo storage
// (shared/platform.ts PLANS[].storageGb). Nothing enforced either: the only
// limit anywhere was express.json's 50 MB per-request cap, so a free tenant
// could upload without bound and Zolto was effectively free unlimited S3 for
// anyone who signed up. S3 itself can't answer "how much does THIS tenant
// use?" cheaply, so we keep the ledger here.
//
// One row per object written through server/storage.ts storagePut, which takes
// a tenantId precisely so this can never be bypassed by a new call site.
// Deletes remove the row, so quota is released when a merchant clears photos.
export const storageObjects = mysqlTable("storage_objects", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  // The final S3 key, after storagePut's hash suffix — unique per object.
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  bytes: int("bytes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StorageObject = typeof storageObjects.$inferSelect;
export type InsertStorageObject = typeof storageObjects.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// MAGIC LINK TOKENS — passwordless email sign-in
// ═══════════════════════════════════════════════════════════════════════════════
// A one-time, short-lived token emailed to whatever address someone types in —
// no tenant scope, since signing in isn't attached to a store yet (that happens
// via tenant.claimAdmin, same as Google/Apple). Kept in its own table (rather
// than overloading users.openId the way the pending-tenant-admin claim token
// does — see tenant.ts createPendingTenantAdmin) because a magic-link identity
// (`email:<address>`) persists across logins, unlike a pending-admin row whose
// openId IS the token.
export const magicLinkTokens = mysqlTable("magic_link_tokens", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  // Sanitized post-login redirect target, stashed here (not a cookie) because
  // the link is typically opened from a mail client, possibly in a different
  // browser context than the one that requested it.
  next: varchar("next", { length: 512 }),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type InsertMagicLinkToken = typeof magicLinkTokens.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// POS PAIRING TOKENS — one-tap register setup
// ═══════════════════════════════════════════════════════════════════════════════

// Short-lived, single-use tokens that let a merchant bind a register by tapping
// a link (`zolto://pair?t=…`) instead of typing a 64-char key on a phone.
//
// The token exists so the POS key itself never travels in a URL, where it would
// land in browser history, server access logs and Referer headers. The app
// redeems the token at POST /api/pos/pair and gets the key over TLS in a
// response body instead.
//
// Deliberately stores NO key: redemption reads the tenant's key from the
// encrypted tenant_secrets vault (provider "pos"). So a dump of this table
// yields nothing usable, and — like magic_link_tokens above — only the SHA-256
// of the token is stored, so even a leaked row can't be redeemed.
export const posPairingTokens = mysqlTable("pos_pairing_tokens", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  // SHA-256 of the token handed to the merchant, never the token itself.
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  // Set by a conditional UPDATE … WHERE consumedAt IS NULL, which is what makes
  // single-use hold under two devices redeeming the same link at once.
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PosPairingToken = typeof posPairingTokens.$inferSelect;
export type InsertPosPairingToken = typeof posPairingTokens.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// SITE IMPORTS — the paid one-time switch-in (shared/platform.ts SITE_IMPORT)
// ═══════════════════════════════════════════════════════════════════════════════

// One attempt at lifting a merchant's existing shop into Zolto. The row IS the
// state machine, and its order is the whole point of the feature's pricing:
//
//   previewed → paid → applied
//
// The crawl and the extraction happen at `previewed`, for free, and the merchant
// sees everything that was found before a payment is asked for. That is what
// makes charging CHF 20 defensible: nobody pays for a crawl that came back
// empty. `paid` is written only by the Stripe webhook, never by the client, and
// `applied` is set once the rows have actually landed in the catalogue — so a
// double-submit or a replayed webhook can't import the same shop twice.
export const siteImports = mysqlTable("site_imports", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  /** The URL the merchant gave us, normalised to an origin + path. */
  sourceUrl: varchar("source_url", { length: 1024 }).notNull(),
  status: mysqlEnum("status", ["previewed", "paid", "applied", "failed"])
    .default("previewed")
    .notNull(),
  /**
   * The extraction, as JSON (products, profile, categories, warnings). Held so
   * the merchant can pay, leave, come back and still get the result they were
   * shown — re-crawling after payment could return something different from
   * what they agreed to buy.
   */
  extraction: json("extraction"),
  /** Denormalised for the admin list and for support, without parsing the JSON. */
  productCount: int("product_count").default(0).notNull(),
  /** Set at checkout, matched by the webhook. */
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  /** Charged amount in cents, recorded as charged rather than as configured. */
  amountCents: int("amount_cents"),
  currency: varchar("currency", { length: 3 }),
  paidAt: timestamp("paid_at"),
  appliedAt: timestamp("applied_at"),
  /** What went wrong, for support. Never shown raw to the merchant. */
  failureReason: varchar("failure_reason", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SiteImport = typeof siteImports.$inferSelect;
export type InsertSiteImport = typeof siteImports.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT HITS — who is reading the machine-facing surfaces (server/agentHits.ts)
// ═══════════════════════════════════════════════════════════════════════════════
// Zolto publishes /llms.txt, /llms-full.txt and an MCP endpoint on the bet that
// an AI agent will discover a store and buy from it. `orders.channel = 'agent'`
// already records the ones that bought; nothing recorded the reach that comes
// first, and no client-side analytics ever could — an agent fetching /llms.txt
// never loads the SPA and never runs JavaScript.
//
// PRE-AGGREGATED, one row per (store, day, surface, tool, agent), incremented
// in place. Not a per-request log: /mcp is a hot path an agent can loop on, and
// an unbounded insert log on it is a disk-fill waiting to happen. The cost of
// the choice is that individual requests aren't recoverable — deliberate, since
// nothing here should ever answer a question about one visitor.
//
// TWO SENTINELS, both of which exist because MySQL treats NULLs as distinct in
// a UNIQUE index. A nullable column in the key below would make ON DUPLICATE
// KEY UPDATE silently never fire for the platform surface or for a non-MCP
// request — inserting a fresh row per hit and turning the whole table back into
// the per-request log it is designed not to be:
//   * tenant_id = 0  → the platform surface (zolto.ch itself), not a store.
//     No tenants row has id 0, so it can't collide with a real store.
//   * mcp_tool = ''  → this hit wasn't an MCP tools/call.
export const agentHits = mysqlTable(
  "agent_hits",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Store this hit was addressed to, or 0 for the platform surface. */
    tenantId: int("tenant_id").notNull().default(0),
    /** UTC `YYYY-MM-DD` (shared/aiAgents.ts dayKey). */
    day: varchar("day", { length: 10 }).notNull(),
    /** One of shared/aiAgents.ts AGENT_SURFACES. */
    surface: varchar("surface", { length: 32 }).notNull(),
    /** MCP tool name for a tools/call, else ''. */
    mcpTool: varchar("mcp_tool", { length: 64 }).notNull().default(""),
    /** Display label from shared/aiAgents.ts classifyAgent, e.g. "GPTBot". */
    agent: varchar("agent", { length: 64 }).notNull(),
    count: int("count").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_hits_bucket").on(
      t.tenantId,
      t.day,
      t.surface,
      t.mcpTool,
      t.agent,
    ),
  ],
);

export type AgentHit = typeof agentHits.$inferSelect;
export type InsertAgentHit = typeof agentHits.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTIMONIALS — What a store's own customers said, in their own words
// ═══════════════════════════════════════════════════════════════════════════════
// Scoped to a tenant and rendered at the foot of that tenant's home page. The
// merchant collects these themselves (an email reply, a WhatsApp message, a
// Google review they were pointed at) and types them in — there is no
// automatic import, and deliberately so: a quote that arrives here was
// consciously published by the shop owner, which is what makes them
// answerable for it.
//
// Identity is the whole point of a testimonial, so a row carries as much of it
// as the customer agreed to give:
//   author_photo_url — a picture they supplied, shown as the avatar;
//   google_id        — their Google account id, when the quote came from a
//                      Google review and the merchant wants that stated.
// Neither is required; with neither, the avatar falls back to the author's
// initials. `google_id` is unique per tenant, so the same Google reviewer
// cannot be entered twice by two different staff members.
export const testimonials = mysqlTable(
  "testimonials",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    /** As the customer wants to be credited — "Anna M." is a valid answer. */
    authorName: varchar("author_name", { length: 120 }).notNull(),
    /**
     * Where they are or what they do ("Zürich", "wedding client") — the line
     * under the name. Optional; a quote reads fine without it.
     */
    authorTitle: varchar("author_title", { length: 120 }),
    /**
     * The customer's own photo, as a hosted URL (matching logo_url and
     * hero_image_url, which are URLs rather than uploads on the same admin
     * surface). NULL renders initials instead.
     */
    authorPhotoUrl: varchar("author_photo_url", { length: 1024 }),
    /**
     * The customer's Google account id, when the quote came from a Google
     * review. Stored so a merchant can point at where the review lives and so
     * the same reviewer is never entered twice — never rendered raw to
     * shoppers, which is what `source` is for.
     */
    googleId: varchar("google_id", { length: 64 }),
    /** The quote itself, plain text. No markup is rendered anywhere. */
    quote: text("quote").notNull(),
    /** 1–5 if the customer gave one; NULL when the quote carries no rating. */
    rating: int("rating"),
    /**
     * Where the words came from. Drives the small provenance line under the
     * quote ("via Google", "via Trustpilot") — an unattributed quote and a
     * quote that names its source are read very differently, and only the
     * merchant knows which this is.
     */
    source: mysqlEnum("source", ["manual", "google", "trustpilot"])
      .default("manual")
      .notNull(),
    /**
     * Unpublished rows stay in the admin list but never reach the storefront —
     * how a merchant takes a quote down without deleting the record of it.
     */
    published: boolean("published").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("testimonials_tenant_google").on(t.tenantId, t.googleId)],
);

export type Testimonial = typeof testimonials.$inferSelect;
export type InsertTestimonial = typeof testimonials.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOUNT CODES — Per-store promotions and friends-and-family codes
// ═══════════════════════════════════════════════════════════════════════════════
// One row per code. `code` is unique WITHIN a tenant, not globally: two shops
// both running "WELCOME10" is normal, and a global unique index would let the
// first store to claim a word take it away from every other store on the
// platform.
//
// The terms are evaluated by shared/discounts.ts, which is pure — the same
// arithmetic runs in the admin preview, in the storefront's live check and in
// the Stripe session that actually charges the card.
export const discountCodes = mysqlTable(
  "discount_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    /** Canonical (upper-case) form — see normaliseDiscountCode. */
    code: varchar("code", { length: 32 }).notNull(),
    kind: mysqlEnum("kind", ["percent", "amount"]).notNull(),
    /** Whole percent (1–100) for "percent", minor units for "amount". */
    value: int("value").notNull(),
    /**
     * Only meaningful for a fixed amount: "CHF 10 off" is not "EUR 10 off",
     * and a code minted in one currency is refused in another rather than
     * silently discounting more than the merchant wrote.
     */
    currency: varchar("currency", { length: 3 }),
    /** Free-text campaign label ("friends-family", "spring-market"). */
    campaign: varchar("campaign", { length: 64 }),
    /** Smallest basket this code applies to, in minor units. NULL = any. */
    minSubtotalRappen: int("min_subtotal_rappen"),
    /** NULL = unlimited. 1 = a single-use code, the friends-and-family shape. */
    maxRedemptions: int("max_redemptions"),
    /**
     * Slots taken: confirmed redemptions PLUS live checkout holds. Incremented
     * by a conditional UPDATE that fails when the limit is reached, which is
     * what makes "50 codes, 50 customers" hold under concurrency — a read-then-
     * write check would let two simultaneous checkouts both see 49.
     */
    redeemedCount: int("redeemed_count").notNull().default(0),
    startsAt: timestamp("starts_at"),
    expiresAt: timestamp("expires_at"),
    /** Merchant's off switch. Deactivating never deletes the history. */
    active: boolean("active").notNull().default(true),
    /** users.id of whoever minted it, for the admin list. */
    createdBy: int("created_by"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("discount_codes_tenant_code").on(t.tenantId, t.code)],
);

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOUNT REDEMPTIONS — Who spent which code, and on what
// ═══════════════════════════════════════════════════════════════════════════════
// A redemption is created as `held` when a Checkout Session is opened, and
// becomes `confirmed` when that session is paid. The hold is what stops a
// single-use code being spent twice in the minutes between "pay now" and the
// webhook; `held_until` matches the session's own expiry, so an abandoned
// checkout gives the slot back instead of burning the code forever.
//
// `stripe_session_id` is unique: a replayed webhook confirms the same row
// rather than recording a second redemption of the same code.
export const discountRedemptions = mysqlTable("discount_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  discountCodeId: int("discount_code_id").notNull(),
  /** Set once the order row exists and is paid. */
  orderId: int("order_id"),
  stripeSessionId: varchar("stripe_session_id", { length: 255 })
    .notNull()
    .unique(),
  status: mysqlEnum("status", ["held", "confirmed", "released"])
    .default("held")
    .notNull(),
  /** What came off, in minor units — as charged, not as configured. */
  amountOffRappen: int("amount_off_rappen").notNull(),
  currency: varchar("currency", { length: 3 }),
  /** Captured from the paid session, so a merchant can see who used what. */
  customerEmail: varchar("customer_email", { length: 320 }),
  /** When an unconfirmed hold stops counting against the redemption limit. */
  heldUntil: timestamp("held_until"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DiscountRedemption = typeof discountRedemptions.$inferSelect;
export type InsertDiscountRedemption = typeof discountRedemptions.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET MIRRORS — the Google Sheets mirror of a store's sales and inventory
// ═══════════════════════════════════════════════════════════════════════════════
// One spreadsheet per store, created and OWNED by the platform service account
// and then shared with the merchant. A merchant thinks in rows and columns; this
// gives them that surface (filters, pivots, something to hand an accountant)
// without moving the ledger out of MySQL.
//
// Why the database stays authoritative, in one line each — the reasoning is
// worth keeping next to the table that could tempt someone to invert it:
//   - reserveProducts (server/db.ts) is a compare-and-set. The Sheets API has
//     no conditional write, so two concurrent checkouts both "win" and a
//     one-of-a-kind piece sells twice.
//   - a POS sale inserts its order, its items, and decrements stock in one
//     transaction; Sheets has no rollback.
//   - orders.stripeSessionId is UNIQUE, which is what makes a retried Stripe
//     webhook idempotent. A sheet cannot enforce that.
// So: sheet as interface, database as ledger. Everything here is derived state.
//
// `tenant_id` is UNIQUE — one mirror per store. A second row would mean two
// spreadsheets diverging, each looking authoritative.
export const sheetMirrors = mysqlTable("sheet_mirrors", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().unique(),
  spreadsheetId: varchar("spreadsheet_id", { length: 128 }).notNull(),
  spreadsheetUrl: varchar("spreadsheet_url", { length: 512 }).notNull(),
  /** The merchant address the file was shared with, for the admin to see. */
  sharedWith: varchar("shared_with", { length: 320 }).notNull(),
  // Lane 2. False = the merchant is a Drive *reader* and the whole file is
  // read-only. True = they are a writer, and the read-only tabs are held that
  // way by protected ranges instead (server/sheetMirror.ts) — Drive has no
  // per-tab permission, so the protection IS the safety, and flipping this
  // without re-applying it hands over an editable ledger.
  stockInEnabled: boolean("stock_in_enabled").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at"),
  /**
   * Why the last push failed, or NULL after a clean one. Kept rather than only
   * logged: the merchant is the one who can fix the usual causes (they deleted
   * the file, or removed their own access), and they never read server logs.
   */
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SheetMirror = typeof sheetMirrors.$inferSelect;
export type InsertSheetMirror = typeof sheetMirrors.$inferInsert;
