import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool as MySqlPool, PoolConnection } from "mysql2";
import * as schema from "../drizzle/schema";
import {
  type BulkUploadLog,
  bulkUploadLogs,
  type InsertBulkUploadLog,
  type InsertOrder,
  type InsertProduct,
  type InsertProductImage,
  type InsertStripeReconciliation,
  type InsertTenant,
  type InsertTenantSetting,
  type InsertUser,
  instagramPosts,
  type Order,
  orders,
  posOrderItems,
  posOrders,
  type Product,
  productImages,
  products,
  type StripeReconciliation,
  stripeReconciliations,
  users,
  tenants,
  tenantSettings,
  type Tenant,
  type TenantSetting,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  DEFAULT_TENANT_ID,
  withTenant,
  type WithOptionalTenant,
} from "./_core/tenant";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) {
      throw new Error("Database not initialized. Call getDb() first.");
    }
    return (_db as any)[prop];
  },
});

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// A stuck connection-pool acquisition or wedged query would otherwise hang a
// request (and its caller's UI) forever, since mysql2 has no built-in bound
// on how long a query can wait. Race every query against this so a bad
// connection surfaces as a fast, retryable error instead of an infinite spin.
const DB_OP_TIMEOUT_MS = 10_000;

// Runs fn against a connection checked out just for this call (instead of
// letting mysql2 pick one from the pool internally), so that if the timeout
// fires we can destroy that exact connection — forcing MySQL to notice the
// client is gone and abort whatever it was doing server-side — rather than
// only giving up on the JS side while the query keeps running on a
// connection the pool still considers healthy and reusable. Without this, a
// query genuinely stuck (e.g. blocked on a lock held by another session)
// leaves an orphaned connection on the server indefinitely, invisible to
// the app that gave up waiting on it.
async function withTimeout<T>(db: Db, fn: (db: Db) => Promise<T>): Promise<T> {
  const pool = db.$client as MySqlPool;
  const connection = await new Promise<PoolConnection>((resolve, reject) => {
    pool.getConnection((err, conn) => (err ? reject(err) : resolve(conn)));
  });

  const scopedDb = drizzle(connection) as unknown as Db;
  let timer!: NodeJS.Timeout;
  let timedOut = false;
  try {
    return await Promise.race([
      fn(scopedDb),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          connection.destroy();
          reject(new Error("Database operation timed out"));
        }, DB_OP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (!timedOut) connection.release();
  }
}

// Run a read query, returning `fallback` when the database is unavailable.
// Keeps read paths resilient (the app degrades to empty results rather than
// throwing) without repeating the null-guard in every function.
async function withDb<T>(fn: (db: Db) => Promise<T>, fallback: T): Promise<T> {
  const db = await getDb();
  if (!db) return fallback;
  try {
    return await withTimeout(db, fn);
  } catch (error) {
    console.warn("[Database] Read query failed or timed out:", error);
    return fallback;
  }
}

// Run a write, throwing when the database is unavailable. Callers that mutate
// state must not silently no-op, so a missing DB is a hard error.
async function withDbOrThrow<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return withTimeout(db, fn);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(
  user: WithOptionalTenant<InsertUser>
): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = {
    openId: user.openId,
    tenantId: user.tenantId ?? DEFAULT_TENANT_ID,
  };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  return withDb(async db => {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

// ─── Products ─────────────────────────────────────────────────────────────────

// Every product read/write is scoped to a tenant. `tenantId` is the FIRST
// argument on purpose — it is not optional and every WHERE clause includes it,
// so a caller can never touch another tenant's catalogue (a mismatched id
// simply matches no rows). Storefront callers pass `ctx.tenant.id`; admin
// callers pass `ctx.user.tenantId`.
export async function getVisibleProducts(tenantId: number) {
  return withDb(
    db =>
      db
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            eq(products.visible, true),
            isNotNull(products.imageUrl)
          )
        )
        .orderBy(desc(products.createdAt)),
    []
  );
}

export async function getAllProducts(tenantId: number) {
  return withDb(
    db =>
      db
        .select()
        .from(products)
        .where(eq(products.tenantId, tenantId))
        .orderBy(desc(products.createdAt)),
    []
  );
}

export async function getProductById(tenantId: number, id: number) {
  return withDb(async db => {
    const result = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getVisibleProductById(tenantId: number, id: number) {
  return withDb(async db => {
    const result = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.id, id),
          eq(products.visible, true),
          isNotNull(products.imageUrl)
        )
      )
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getProductByDiscordMessageId(
  tenantId: number,
  discordMessageId: string
) {
  return withDb(async db => {
    const result = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.discordMessageId, discordMessageId)
        )
      )
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function createProduct(data: WithOptionalTenant<InsertProduct>) {
  return withDbOrThrow(db => db.insert(products).values(withTenant(data)));
}

export async function setProductVisibility(
  tenantId: number,
  id: number,
  visible: boolean
) {
  await withDbOrThrow(db =>
    db
      .update(products)
      .set({ visible })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
  );
}

export async function deleteProduct(tenantId: number, id: number) {
  await withDbOrThrow(db =>
    db
      .delete(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
  );
}

export async function setProductSold(
  tenantId: number,
  id: number,
  sold: boolean
) {
  await withDbOrThrow(db =>
    db
      .update(products)
      .set({ sold })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
  );
}

export async function updateProduct(
  tenantId: number,
  id: number,
  data: Partial<Omit<InsertProduct, "id">>
) {
  await withDbOrThrow(db =>
    db
      .update(products)
      .set(data)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
  );
}

export async function setProductQuantity(
  tenantId: number,
  id: number,
  quantity: number
) {
  await withDbOrThrow(db =>
    db
      .update(products)
      .set({ quantity, sold: quantity <= 0 })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
  );
}

export async function getProductsByIds(tenantId: number, ids: number[]) {
  if (ids.length === 0) return [];
  return withDb(
    db =>
      db
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids))),
    []
  );
}

export async function markProductsSold(tenantId: number, ids: number[]) {
  if (ids.length === 0) return;
  const db = await getDb();
  if (!db) return;
  // Decrement quantity by 1 per sale; mark sold=true when quantity reaches 0.
  // Uses GREATEST(0, ...) to prevent negative stock.
  // Evaluates current `quantity` before the SET, so `quantity <= 1` means
  // it will become 0 after decrement — that is when sold flips to true.
  await db
    .update(products)
    .set({
      quantity: sql`GREATEST(0, \`quantity\` - 1)`,
      sold: sql`CASE WHEN \`quantity\` <= 1 THEN TRUE ELSE \`sold\` END`,
    })
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids)));
}

// ─── Product Images ───────────────────────────────────────────────────────────

export async function getProductImages(tenantId: number, productId: number) {
  return withDb(
    db =>
      db
        .select()
        .from(productImages)
        .where(
          and(
            eq(productImages.tenantId, tenantId),
            eq(productImages.productId, productId)
          )
        )
        .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt)),
    []
  );
}

export async function addProductImage(
  data: WithOptionalTenant<InsertProductImage>
) {
  return withDbOrThrow(db => db.insert(productImages).values(withTenant(data)));
}

export async function deleteProductImage(tenantId: number, id: number) {
  await withDbOrThrow(db =>
    db
      .delete(productImages)
      .where(and(eq(productImages.tenantId, tenantId), eq(productImages.id, id)))
  );
}

export async function deleteAllProductImages(
  tenantId: number,
  productId: number
) {
  await withDbOrThrow(db =>
    db
      .delete(productImages)
      .where(
        and(
          eq(productImages.tenantId, tenantId),
          eq(productImages.productId, productId)
        )
      )
  );
}

// ─── Instagram Posts ──────────────────────────────────────────────────────────

export async function getInstagramPosts() {
  return withDb(
    db =>
      db
        .select()
        .from(instagramPosts)
        .orderBy(asc(instagramPosts.sortOrder), asc(instagramPosts.createdAt)),
    []
  );
}

export async function addInstagramPost(postUrl: string, sortOrder: number) {
  await withDbOrThrow(db =>
    db
      .insert(instagramPosts)
      .values({ postUrl, sortOrder, tenantId: DEFAULT_TENANT_ID })
  );
}

export async function deleteInstagramPost(id: number) {
  await withDbOrThrow(db =>
    db.delete(instagramPosts).where(eq(instagramPosts.id, id))
  );
}

export async function reorderInstagramPost(id: number, sortOrder: number) {
  await withDbOrThrow(db =>
    db
      .update(instagramPosts)
      .set({ sortOrder })
      .where(eq(instagramPosts.id, id))
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function createOrder(data: WithOptionalTenant<InsertOrder>) {
  await withDbOrThrow(db => db.insert(orders).values(withTenant(data)));
}

export async function getOrderBySessionId(
  stripeSessionId: string
): Promise<Order | undefined> {
  return withDb(async db => {
    const result = await db
      .select()
      .from(orders)
      .where(eq(orders.stripeSessionId, stripeSessionId))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function updateOrderBySessionId(
  stripeSessionId: string,
  data: Partial<InsertOrder>
) {
  await withDbOrThrow(db =>
    db
      .update(orders)
      .set(data)
      .where(eq(orders.stripeSessionId, stripeSessionId))
  );
}

// ─── Bulk Upload Logs ─────────────────────────────────────────────────────────

export async function insertBulkUploadLog(
  data: WithOptionalTenant<InsertBulkUploadLog>
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot insert bulk upload log: database not available"
    );
    return;
  }
  await db.insert(bulkUploadLogs).values(withTenant(data));
}

export async function getProductsMissingTranslation(tenantId: number) {
  return withDb(
    db =>
      db
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            or(isNull(products.nameEn), isNull(products.descriptionEn))
          )
        )
        .orderBy(desc(products.createdAt)),
    []
  );
}

export async function getPaidOrders(limit = 200): Promise<Order[]> {
  return withDb(
    db =>
      db
        .select()
        .from(orders)
        .where(eq(orders.status, "paid"))
        .orderBy(desc(orders.createdAt))
        .limit(limit),
    []
  );
}

export async function getBulkUploadLogs(limit = 100): Promise<BulkUploadLog[]> {
  return withDb(
    db =>
      db
        .select()
        .from(bulkUploadLogs)
        .orderBy(desc(bulkUploadLogs.createdAt))
        .limit(limit),
    []
  );
}

// ─── Stripe Reconciliation ────────────────────────────────────────────────────

// In-stock products a customer could plausibly have paid for, used as the
// candidate pool when guessing which piece an orphaned Stripe payment was for.
export async function getAvailableProductsForMatching(
  tenantId: number
): Promise<Product[]> {
  return withDb(
    db =>
      db
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            eq(products.visible, true),
            eq(products.sold, false),
            gt(products.quantity, 0)
          )
        ),
    []
  );
}

export async function getKnownOrderPaymentIntentIds(): Promise<Set<string>> {
  return withDb(async db => {
    const rows = await db
      .select({ id: orders.stripePaymentIntentId })
      .from(orders)
      .where(isNotNull(orders.stripePaymentIntentId));
    return new Set(rows.map(r => r.id).filter((id): id is string => !!id));
  }, new Set<string>());
}

export async function getKnownPosPaymentIntentIds(): Promise<Set<string>> {
  return withDb(async db => {
    const rows = await db
      .select({ id: posOrders.stripePaymentIntentId })
      .from(posOrders)
      .where(isNotNull(posOrders.stripePaymentIntentId));
    return new Set(rows.map(r => r.id).filter((id): id is string => !!id));
  }, new Set<string>());
}

export async function getKnownReconciliationPaymentIntentIds(): Promise<
  Set<string>
> {
  return withDb(async db => {
    const rows = await db
      .select({ id: stripeReconciliations.stripePaymentIntentId })
      .from(stripeReconciliations);
    return new Set(rows.map(r => r.id));
  }, new Set<string>());
}

export async function createStripeReconciliation(
  data: WithOptionalTenant<InsertStripeReconciliation>
): Promise<void> {
  await withDbOrThrow(db =>
    db.insert(stripeReconciliations).values(withTenant(data))
  );
}

export async function getStripeReconciliationByToken(
  token: string
): Promise<StripeReconciliation | undefined> {
  return withDb(async db => {
    const result = await db
      .select()
      .from(stripeReconciliations)
      .where(eq(stripeReconciliations.confirmationToken, token))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function rejectStripeReconciliation(id: number): Promise<void> {
  await withDbOrThrow(db =>
    db
      .update(stripeReconciliations)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(stripeReconciliations.id, id))
  );
}

// Records the admin's confirmed match as a POS-style sale (this payment never
// went through the checkout flow, so it has no Stripe Checkout Session to
// attach to `orders`) and decrements inventory for the chosen product — all
// in one transaction so a mid-way failure can't record the sale without
// updating stock, or vice versa.
export async function resolveStripeReconciliationConfirmed(
  reconciliationId: number,
  productId: number,
  amountRappen: number,
  stripePaymentIntentId: string
): Promise<void> {
  await withDbOrThrow(db =>
    db.transaction(async tx => {
      const inserted = await tx.insert(posOrders).values({
        stripePaymentIntentId,
        status: "paid",
        totalRappen: amountRappen,
        tenantId: DEFAULT_TENANT_ID,
      });
      const posOrderId =
        (inserted as unknown as { insertId?: number }).insertId ?? 0;

      await tx.insert(posOrderItems).values({
        posOrderId,
        productId,
        priceRappen: amountRappen,
        tenantId: DEFAULT_TENANT_ID,
      });

      await tx
        .update(products)
        .set({
          quantity: sql`GREATEST(0, \`quantity\` - 1)`,
          sold: sql`CASE WHEN \`quantity\` <= 1 THEN TRUE ELSE \`sold\` END`,
        })
        .where(eq(products.id, productId));

      await tx
        .update(stripeReconciliations)
        .set({
          status: "confirmed",
          chosenProductId: productId,
          resolvedAt: new Date(),
        })
        .where(eq(stripeReconciliations.id, reconciliationId));
    })
  );
}

// ─── Tenants ──────────────────────────────────────────────────────────────────

export async function getTenantByDiscordChannelId(
  channelId: string
): Promise<Tenant | undefined> {
  return withDb(async db => {
    const result = await db
      .select({ tenant: tenants })
      .from(tenants)
      .innerJoin(tenantSettings, eq(tenants.id, tenantSettings.tenantId))
      .where(eq(tenantSettings.discordChannelId, channelId))
      .limit(1);
    return result.length > 0 ? result[0].tenant : undefined;
  }, undefined);
}

export async function getTenantBySlackChannelId(
  channelId: string
): Promise<Tenant | undefined> {
  return withDb(async db => {
    const result = await db
      .select({ tenant: tenants })
      .from(tenants)
      .innerJoin(tenantSettings, eq(tenants.id, tenantSettings.tenantId))
      .where(eq(tenantSettings.slackChannelId, channelId))
      .limit(1);
    return result.length > 0 ? result[0].tenant : undefined;
  }, undefined);
}

export async function getTenantSettings(
  tenantId: number
): Promise<TenantSetting | undefined> {
  return withDb(async db => {
    const result = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getTenantById(
  id: number
): Promise<Tenant | undefined> {
  return withDb(async db => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

// Resolve the tenant that owns a POS API key. POS clients authenticate purely by
// this key (see server/pos.ts requirePosKey); returns undefined for an unknown
// key or when the database is unavailable.
export async function getTenantByPosApiKey(
  apiKey: string
): Promise<Tenant | undefined> {
  return withDb(async db => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.posApiKey, apiKey))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
  return withDb(async db => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getTenantByReferralCode(
  code: string
): Promise<Tenant | undefined> {
  return withDb(async db => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.referralCode, code))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

// ─── Self-serve signup ────────────────────────────────────────────────────────

export async function createTenant(data: InsertTenant): Promise<number> {
  return withDbOrThrow(async db => {
    const [row] = await db.insert(tenants).values(data).$returningId();
    return row.id;
  });
}

export async function createTenantSettings(
  data: InsertTenantSetting
): Promise<void> {
  await withDbOrThrow(db => db.insert(tenantSettings).values(data));
}

export async function setTenantStripeCustomer(
  tenantId: number,
  stripeCustomerId: string
): Promise<void> {
  await withDbOrThrow(db =>
    db.update(tenants).set({ stripeCustomerId }).where(eq(tenants.id, tenantId))
  );
}

export async function setTenantReferrer(
  tenantId: number,
  referrerId: number
): Promise<void> {
  await withDbOrThrow(db =>
    db
      .update(tenants)
      .set({ referredBy: referrerId, referralDiscountApplied: true })
      .where(eq(tenants.id, tenantId))
  );
}

// A pending admin holds the tenant's admin slot until the owner signs in (via
// OAuth) and claims it with the token. Keyed by `pending:<token>` so it can't be
// confused with a real login (`google:<sub>`), and never grants access on its own.
export async function createPendingTenantAdmin(
  tenantId: number,
  email: string,
  claimToken: string
): Promise<void> {
  await withDbOrThrow(db =>
    db.insert(users).values({
      tenantId,
      openId: `pending:${claimToken}`,
      email,
      role: "admin",
      loginMethod: "pending",
    })
  );
}

export async function assignUserToTenantAsAdmin(
  openId: string,
  tenantId: number
): Promise<void> {
  await withDbOrThrow(db =>
    db
      .update(users)
      .set({ tenantId, role: "admin" })
      .where(eq(users.openId, openId))
  );
}

export async function deleteUserById(id: number): Promise<void> {
  await withDbOrThrow(db => db.delete(users).where(eq(users.id, id)));
}
