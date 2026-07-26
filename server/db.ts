import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "node:crypto";
import type { Pool as MySqlPool, PoolConnection } from "mysql2";
import * as schema from "../drizzle/schema";
import {
  type BulkUploadLog,
  bulkUploadLogs,
  type InsertBulkUploadLog,
  type InsertOrder,
  type InsertPosAttribution,
  type InsertProduct,
  type InsertProductImage,
  type InsertStripeReconciliation,
  type InsertTenant,
  type InsertTenantSetting,
  type InsertUser,
  type User,
  instagramPosts,
  type Order,
  orders,
  type PhotoCreditLedgerEntry,
  photoCreditLedger,
  type PosAttribution,
  type StaffInvite,
  staffInvites,
  posAttributions,
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
  user: WithOptionalTenant<InsertUser>,
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
  return withDb(async (db) => {
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
    (db) =>
      db
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            eq(products.visible, true),
            isNotNull(products.imageUrl),
          ),
        )
        .orderBy(desc(products.createdAt)),
    [],
  );
}

export async function getAllProducts(tenantId: number) {
  return withDb(
    (db) =>
      db
        .select()
        .from(products)
        .where(eq(products.tenantId, tenantId))
        .orderBy(desc(products.createdAt)),
    [],
  );
}

export async function getProductById(tenantId: number, id: number) {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getVisibleProductById(tenantId: number, id: number) {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.id, id),
          eq(products.visible, true),
          isNotNull(products.imageUrl),
        ),
      )
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getProductByDiscordMessageId(
  tenantId: number,
  discordMessageId: string,
) {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.discordMessageId, discordMessageId),
        ),
      )
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function createProduct(data: WithOptionalTenant<InsertProduct>) {
  return withDbOrThrow((db) => db.insert(products).values(withTenant(data)));
}

export async function setProductVisibility(
  tenantId: number,
  id: number,
  visible: boolean,
) {
  await withDbOrThrow((db) =>
    db
      .update(products)
      .set({ visible })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id))),
  );
}

export async function deleteProduct(tenantId: number, id: number) {
  await withDbOrThrow((db) =>
    db
      .delete(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id))),
  );
}

export async function setProductSold(
  tenantId: number,
  id: number,
  sold: boolean,
) {
  await withDbOrThrow((db) =>
    db
      .update(products)
      .set({ sold })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id))),
  );
}

export async function updateProduct(
  tenantId: number,
  id: number,
  data: Partial<Omit<InsertProduct, "id">>,
) {
  await withDbOrThrow((db) =>
    db
      .update(products)
      .set(data)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id))),
  );
}

export async function setProductQuantity(
  tenantId: number,
  id: number,
  quantity: number,
) {
  await withDbOrThrow((db) =>
    db
      .update(products)
      .set({ quantity, sold: quantity <= 0 })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id))),
  );
}

export async function getProductsByIds(tenantId: number, ids: number[]) {
  if (ids.length === 0) return [];
  return withDb(
    (db) =>
      db
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids))),
    [],
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
  // Also clears any checkout hold — the piece is definitively sold now, so
  // there's nothing left to reserve.
  await db
    .update(products)
    .set({
      quantity: sql`GREATEST(0, \`quantity\` - 1)`,
      sold: sql`CASE WHEN \`quantity\` <= 1 THEN TRUE ELSE \`sold\` END`,
      reservedUntil: null,
      reservedToken: null,
    })
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids)));
}

// Matches the minimum lifetime Stripe allows for a Checkout Session's
// `expires_at` (30 minutes) — see server/routers/checkout.ts — so a hold
// never outlives the session that placed it, and a session that never
// completes self-heals without depending on a webhook firing.
export const PRODUCT_RESERVATION_TTL_MS = 30 * 60 * 1000;

/**
 * Places a short-lived hold on the given pieces (POS <-> online inventory
 * sync — see docs/planning/phase1/tracker.md "Configure POS ↔ online
 * inventory sync"). Only pieces that are unsold, in stock, and not already
 * held by someone else's still-live reservation are claimed.
 *
 * Uses a random per-call token (not just the expiry timestamp) so the
 * follow-up read can tell "rows we just reserved" apart from "rows already
 * held by a concurrent caller whose reservedUntil happens to land in the
 * same instant" — a bare timestamp comparison can't disambiguate two
 * reservations issued in the same clock tick.
 *
 * Returns the ids that could NOT be reserved (empty array = full success).
 * Callers must release whatever DID succeed if they end up not using it
 * (Stripe API failure, or another id in the batch failed).
 */
export async function reserveProducts(
  tenantId: number,
  ids: number[],
): Promise<number[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return ids;

  const token = crypto.randomBytes(12).toString("hex");
  const until = new Date(Date.now() + PRODUCT_RESERVATION_TTL_MS);
  const now = new Date();

  await db
    .update(products)
    .set({ reservedUntil: until, reservedToken: token })
    .where(
      and(
        eq(products.tenantId, tenantId),
        inArray(products.id, ids),
        eq(products.sold, false),
        gt(products.quantity, 0),
        or(isNull(products.reservedUntil), lt(products.reservedUntil, now)),
      ),
    );

  const claimed = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        inArray(products.id, ids),
        eq(products.reservedToken, token),
      ),
    );

  const claimedIds = new Set(claimed.map((row) => row.id));
  return ids.filter((id) => !claimedIds.has(id));
}

/**
 * Releases a hold placed by reserveProducts — e.g. a Checkout Session
 * expired or failed, or one piece in a batch reservation didn't clear so the
 * rest of the batch must be given back. Unconditional: it clears
 * reservedUntil/reservedToken regardless of the current token, on the
 * (accepted) assumption that by the time a release runs, the reservation
 * this order placed has either already expired on its own or is still the
 * live one — the reservation TTL is short enough that a third party
 * re-reserving the exact same piece in that narrow window is not worth
 * guarding against with per-order token tracking.
 */
export async function releaseProductReservations(
  tenantId: number,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db
    .update(products)
    .set({ reservedUntil: null, reservedToken: null })
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids)));
}

// ─── Product Images ───────────────────────────────────────────────────────────

export async function getProductImages(tenantId: number, productId: number) {
  return withDb(
    (db) =>
      db
        .select()
        .from(productImages)
        .where(
          and(
            eq(productImages.tenantId, tenantId),
            eq(productImages.productId, productId),
          ),
        )
        .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt)),
    [],
  );
}

export async function addProductImage(
  data: WithOptionalTenant<InsertProductImage>,
) {
  return withDbOrThrow((db) =>
    db.insert(productImages).values(withTenant(data)),
  );
}

export async function deleteProductImage(tenantId: number, id: number) {
  await withDbOrThrow((db) =>
    db
      .delete(productImages)
      .where(
        and(eq(productImages.tenantId, tenantId), eq(productImages.id, id)),
      ),
  );
}

export async function deleteAllProductImages(
  tenantId: number,
  productId: number,
) {
  await withDbOrThrow((db) =>
    db
      .delete(productImages)
      .where(
        and(
          eq(productImages.tenantId, tenantId),
          eq(productImages.productId, productId),
        ),
      ),
  );
}

// ─── Instagram Posts ──────────────────────────────────────────────────────────

// Instagram posts are tenant-owned: every read/write is scoped to a tenant so a
// store's curated grid can only ever contain — and be edited through — its own
// posts.
export async function getInstagramPosts(tenantId: number) {
  return withDb(
    (db) =>
      db
        .select()
        .from(instagramPosts)
        .where(eq(instagramPosts.tenantId, tenantId))
        .orderBy(asc(instagramPosts.sortOrder), asc(instagramPosts.createdAt)),
    [],
  );
}

export async function addInstagramPost(
  tenantId: number,
  postUrl: string,
  sortOrder: number,
) {
  await withDbOrThrow((db) =>
    db.insert(instagramPosts).values({ postUrl, sortOrder, tenantId }),
  );
}

export async function deleteInstagramPost(tenantId: number, id: number) {
  await withDbOrThrow((db) =>
    db
      .delete(instagramPosts)
      .where(
        and(eq(instagramPosts.tenantId, tenantId), eq(instagramPosts.id, id)),
      ),
  );
}

export async function reorderInstagramPost(
  tenantId: number,
  id: number,
  sortOrder: number,
) {
  await withDbOrThrow((db) =>
    db
      .update(instagramPosts)
      .set({ sortOrder })
      .where(
        and(eq(instagramPosts.tenantId, tenantId), eq(instagramPosts.id, id)),
      ),
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function createOrder(data: WithOptionalTenant<InsertOrder>) {
  await withDbOrThrow((db) => db.insert(orders).values(withTenant(data)));
}

// Looked up by the globally-unique Stripe session id (the order carries its own
// tenant_id). Not tenant-scoped on purpose: the webhook fulfillment path has no
// tenant in context yet, and the session id is unguessable, so this can only
// ever return the one order that owns that session. Callers that go on to read
// related rows (e.g. products) scope those by the returned order's tenant_id.
export async function getOrderBySessionId(
  stripeSessionId: string,
): Promise<Order | undefined> {
  return withDb(async (db) => {
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
  data: Partial<InsertOrder>,
) {
  await withDbOrThrow((db) =>
    db
      .update(orders)
      .set(data)
      .where(eq(orders.stripeSessionId, stripeSessionId)),
  );
}

// ─── Bulk Upload Logs ─────────────────────────────────────────────────────────

export async function insertBulkUploadLog(
  data: WithOptionalTenant<InsertBulkUploadLog>,
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot insert bulk upload log: database not available",
    );
    return;
  }
  await db.insert(bulkUploadLogs).values(withTenant(data));
}

export async function getProductsMissingTranslation(tenantId: number) {
  return withDb(
    (db) =>
      db
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            or(isNull(products.nameEn), isNull(products.descriptionEn)),
          ),
        )
        .orderBy(desc(products.createdAt)),
    [],
  );
}

export async function getPaidOrders(
  tenantId: number,
  limit = 200,
): Promise<Order[]> {
  return withDb(
    (db) =>
      db
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.status, "paid")))
        .orderBy(desc(orders.createdAt))
        .limit(limit),
    [],
  );
}

export async function getBulkUploadLogs(
  tenantId: number,
  limit = 100,
): Promise<BulkUploadLog[]> {
  return withDb(
    (db) =>
      db
        .select()
        .from(bulkUploadLogs)
        .where(eq(bulkUploadLogs.tenantId, tenantId))
        .orderBy(desc(bulkUploadLogs.createdAt))
        .limit(limit),
    [],
  );
}

// ─── Stripe Reconciliation ────────────────────────────────────────────────────

// In-stock products a customer could plausibly have paid for, used as the
// candidate pool when guessing which piece an orphaned Stripe payment was for.
export async function getAvailableProductsForMatching(
  tenantId: number,
): Promise<Product[]> {
  return withDb(
    (db) =>
      db
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            eq(products.visible, true),
            eq(products.sold, false),
            gt(products.quantity, 0),
          ),
        ),
    [],
  );
}

export async function getKnownOrderPaymentIntentIds(): Promise<Set<string>> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: orders.stripePaymentIntentId })
      .from(orders)
      .where(isNotNull(orders.stripePaymentIntentId));
    return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
  }, new Set<string>());
}

export async function getKnownPosPaymentIntentIds(): Promise<Set<string>> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: posOrders.stripePaymentIntentId })
      .from(posOrders)
      .where(isNotNull(posOrders.stripePaymentIntentId));
    return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
  }, new Set<string>());
}

export async function getKnownReconciliationPaymentIntentIds(): Promise<
  Set<string>
> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: stripeReconciliations.stripePaymentIntentId })
      .from(stripeReconciliations);
    return new Set(rows.map((r) => r.id));
  }, new Set<string>());
}

export async function createStripeReconciliation(
  data: WithOptionalTenant<InsertStripeReconciliation>,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.insert(stripeReconciliations).values(withTenant(data)),
  );
}

export async function getStripeReconciliationByToken(
  token: string,
): Promise<StripeReconciliation | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(stripeReconciliations)
      .where(eq(stripeReconciliations.confirmationToken, token))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function rejectStripeReconciliation(id: number): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(stripeReconciliations)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(stripeReconciliations.id, id)),
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
  stripePaymentIntentId: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.transaction(async (tx) => {
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
    }),
  );
}

// ─── POS attribution (amount-only sales → which product) ───────────────────────

export interface UnattributedPosLine {
  tenantId: number;
  posOrderId: number;
  posOrderItemId: number;
  amountRappen: number;
  name: string | null;
  createdAt: Date;
}

/**
 * Paid POS line items that were sold as a bare amount (no productId) and haven't
 * been queued for attribution yet. A left join against `pos_attributions` keeps
 * each line out once it already has a review row, so repeated day-end runs don't
 * re-queue the same sale.
 */
export async function getUnattributedPosLineItems(
  since: Date,
): Promise<UnattributedPosLine[]> {
  return withDb(async (db) => {
    const rows = await db
      .select({
        tenantId: posOrderItems.tenantId,
        posOrderId: posOrderItems.posOrderId,
        posOrderItemId: posOrderItems.id,
        amountRappen: posOrderItems.priceRappen,
        name: posOrderItems.name,
        createdAt: posOrderItems.createdAt,
      })
      .from(posOrderItems)
      .innerJoin(posOrders, eq(posOrders.id, posOrderItems.posOrderId))
      .leftJoin(
        posAttributions,
        eq(posAttributions.posOrderItemId, posOrderItems.id),
      )
      .where(
        and(
          isNull(posOrderItems.productId),
          eq(posOrders.status, "paid"),
          gte(posOrderItems.createdAt, since),
          isNull(posAttributions.id),
        ),
      );
    return rows;
  }, []);
}

export async function createPosAttribution(
  data: WithOptionalTenant<InsertPosAttribution>,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.insert(posAttributions).values(withTenant(data)),
  );
}

export async function getPosAttributionByToken(
  token: string,
): Promise<PosAttribution | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(posAttributions)
      .where(eq(posAttributions.confirmationToken, token))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function rejectPosAttribution(id: number): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(posAttributions)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(posAttributions.id, id)),
  );
}

/**
 * Attributes an amount-only POS line to the merchant's chosen product: stamps the
 * productId onto the existing line item, decrements that product's stock (marking
 * it sold at zero), and resolves the review row — all in one transaction. Unlike
 * the Stripe path this creates no new order; the pos_order already recorded the sale.
 */
export async function resolvePosAttributionConfirmed(
  attributionId: number,
  posOrderItemId: number,
  productId: number,
  tenantId: number,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.transaction(async (tx) => {
      await tx
        .update(posOrderItems)
        .set({ productId })
        .where(
          and(
            eq(posOrderItems.id, posOrderItemId),
            eq(posOrderItems.tenantId, tenantId),
          ),
        );

      await tx
        .update(products)
        .set({
          quantity: sql`GREATEST(0, \`quantity\` - 1)`,
          sold: sql`CASE WHEN \`quantity\` <= 1 THEN TRUE ELSE \`sold\` END`,
          reservedUntil: null,
          reservedToken: null,
        })
        .where(
          and(eq(products.id, productId), eq(products.tenantId, tenantId)),
        );

      await tx
        .update(posAttributions)
        .set({
          status: "confirmed",
          chosenProductId: productId,
          resolvedAt: new Date(),
        })
        .where(eq(posAttributions.id, attributionId));
    }),
  );
}

// ─── Tenants ──────────────────────────────────────────────────────────────────

export async function getTenantByDiscordChannelId(
  channelId: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
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
  channelId: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
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
  tenantId: number,
): Promise<TenantSetting | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getTenantById(id: number): Promise<Tenant | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

// The person to notify about this tenant's activity (e.g. a paid order) —
// the earliest `role = 'admin'` user row for the tenant, ordered by id so a
// still-pending claim (see createPendingTenantAdmin) resolves to the same
// row that becomes the real admin once claimed. A tenant can in principle
// have more than one admin; this picks one rather than notifying all of
// them, matching notifyOwner's existing single-recipient model.
export async function getTenantAdminContact(
  tenantId: number,
): Promise<{ name: string | null; email: string | null } | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.role, "admin")))
      .orderBy(asc(users.id))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

// Resolve the tenant that owns a POS API key. POS clients authenticate purely by
// this key (see server/pos.ts requirePosKey); returns undefined for an unknown
// key or when the database is unavailable.
export async function getTenantByPosApiKey(
  apiKey: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.posApiKey, apiKey))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getTenantBySlug(
  slug: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  }, undefined);
}

export async function getTenantByReferralCode(
  code: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
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
  return withDbOrThrow(async (db) => {
    const [row] = await db.insert(tenants).values(data).$returningId();
    return row.id;
  });
}

export async function createTenantSettings(
  data: InsertTenantSetting,
): Promise<void> {
  await withDbOrThrow((db) => db.insert(tenantSettings).values(data));
}

export async function setTenantStripeCustomer(
  tenantId: number,
  stripeCustomerId: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(tenants)
      .set({ stripeCustomerId })
      .where(eq(tenants.id, tenantId)),
  );
}

// Links a tenant's OWN Stripe Standard account (Connect) for their storefront
// checkout — separate from setTenantStripeCustomer above, which is Zolto's own
// billing relationship with the tenant.
export async function setTenantStripeConnectAccount(
  tenantId: number,
  stripeConnectedAccountId: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(tenants)
      .set({ stripeConnectedAccountId })
      .where(eq(tenants.id, tenantId)),
  );
}

export async function setTenantReferrer(
  tenantId: number,
  referrerId: number,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(tenants)
      .set({ referredBy: referrerId, referralDiscountApplied: true })
      .where(eq(tenants.id, tenantId)),
  );
}

// A pending admin holds the tenant's admin slot until the owner signs in (via
// OAuth) and claims it with the token. Keyed by `pending:<token>` so it can't be
// confused with a real login (`google:<sub>`), and never grants access on its own.
export async function createPendingTenantAdmin(
  tenantId: number,
  email: string,
  claimToken: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.insert(users).values({
      tenantId,
      openId: `pending:${claimToken}`,
      email,
      role: "admin",
      loginMethod: "pending",
    }),
  );
}

export async function assignUserToTenantAsAdmin(
  openId: string,
  tenantId: number,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(users)
      .set({ tenantId, role: "admin" })
      .where(eq(users.openId, openId)),
  );
}

export async function deleteUserById(id: number): Promise<void> {
  await withDbOrThrow((db) => db.delete(users).where(eq(users.id, id)));
}

// ─── Billing (Zolto's own subscription relationship with tenants) ─────────────
// Distinct from storefront payments: stripeCustomerId/stripeSubscriptionId here
// belong to Zolto's own Stripe account and bill the MERCHANT for their plan;
// stripeConnectedAccountId is the merchant's own account their customers pay
// into (see server/stripeConnect.ts).

export async function getTenantByStripeCustomerId(
  customerId: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.stripeCustomerId, customerId))
      .limit(1);
    return rows[0];
  }, undefined);
}

// ─── POS Terminal (Tap to Pay) ────────────────────────────────────────────────

/** Persist the Terminal Location id provisioned on the tenant's Connect account. */
export async function setTenantTerminalLocation(
  tenantId: number,
  locationId: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(tenants)
      .set({ terminalLocationId: locationId })
      .where(eq(tenants.id, tenantId)),
  );
}

// ─── Custom domains ───────────────────────────────────────────────────────────
/**
 * Find the settings row for a registered custom domain. Used by the Caddy
 * on-demand-TLS "ask" endpoint: only domains a Maker+ tenant actually saved
 * may get a certificate, so strangers can't mint certs through our Caddy.
 */
export async function getTenantSettingsByDomain(
  domain: string,
): Promise<TenantSetting | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.publicDomain, domain.toLowerCase()))
      .limit(1);
    return rows[0];
  }, undefined);
}

export async function getTenantByStripeSubscriptionId(
  subscriptionId: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.stripeSubscriptionId, subscriptionId))
      .limit(1);
    return rows[0];
  }, undefined);
}

/**
 * Sync a tenant's plan/billing state from a Stripe subscription event. Only the
 * provided fields are written, so a `customer.subscription.updated` that says
 * nothing about the plan leaves the plan alone.
 */
export async function updateTenantBilling(
  tenantId: number,
  fields: Partial<
    Pick<Tenant, "plan" | "subscriptionStatus" | "stripeSubscriptionId">
  >,
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  await withDbOrThrow((db) =>
    db.update(tenants).set(fields).where(eq(tenants.id, tenantId)),
  );
}

// ─── Photo credit ledger (AI photo metering) ─────────────────────────────────
// Balance = SUM(delta) for the tenant. Grants are positive entries
// (monthly_grant/purchase/manual_adjustment), consumption is -1 per image.
// Append-only: never update or delete rows, correct with a manual_adjustment.

export async function getPhotoCreditBalance(tenantId: number): Promise<number> {
  return withDb(async (db) => {
    const rows = await db
      .select({
        balance: sql<number>`COALESCE(SUM(${photoCreditLedger.delta}), 0)`,
      })
      .from(photoCreditLedger)
      .where(eq(photoCreditLedger.tenantId, tenantId));
    return Number(rows[0]?.balance ?? 0);
  }, 0);
}

export async function addPhotoCreditEntry(entry: {
  tenantId: number;
  delta: number;
  kind: PhotoCreditLedgerEntry["kind"];
  ref?: string | null;
  note?: string | null;
}): Promise<void> {
  if (!Number.isInteger(entry.delta) || entry.delta === 0) {
    throw new Error("Photo credit delta must be a non-zero integer");
  }
  await withDbOrThrow((db) =>
    db.insert(photoCreditLedger).values({
      tenantId: entry.tenantId,
      delta: entry.delta,
      kind: entry.kind,
      ref: entry.ref ?? null,
      note: entry.note ?? null,
    }),
  );
}

/**
 * Consume one credit for an AI photo generation. Returns false (and writes
 * nothing) when the tenant has no credits left, so callers can distinguish
 * "no balance" from a successful deduction. The check-then-insert is not a
 * serializable transaction; the only consumer is the admin product editor,
 * where two simultaneous generations by the same merchant are unlikely, and
 * the worst case is one extra image granted — a deliberate availability-over-
 * strictness tradeoff for a goodwill-priced feature.
 */
export async function consumePhotoCredit(
  tenantId: number,
  ref?: string | null,
): Promise<boolean> {
  const balance = await getPhotoCreditBalance(tenantId);
  if (balance <= 0) return false;
  await addPhotoCreditEntry({
    tenantId,
    delta: -1,
    kind: "consumption",
    ref: ref ?? null,
  });
  return true;
}

/** List a tenant's ledger entries, newest first (for the billing page). */
export async function getPhotoCreditHistory(
  tenantId: number,
  limit = 50,
): Promise<PhotoCreditLedgerEntry[]> {
  return withDb(async (db) => {
    return db
      .select()
      .from(photoCreditLedger)
      .where(eq(photoCreditLedger.tenantId, tenantId))
      .orderBy(desc(photoCreditLedger.createdAt))
      .limit(limit);
  }, []);
}

// ─── Staff seats + invites ────────────────────────────────────────────────────
// A seat = a users row with role admin/staff (customers never consume seats).
// Pending invites hold a seat too, so the plan's seat limit applies to
// "current team + outstanding invites".

/** Users occupying staff seats (admin + staff), newest first. */
export async function getTenantStaff(tenantId: number): Promise<User[]> {
  return withDb(async (db) => {
    return db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          inArray(users.role, ["admin", "staff"]),
        ),
      )
      .orderBy(desc(users.createdAt));
  }, []);
}

export async function countTenantStaff(tenantId: number): Promise<number> {
  return withDb(async (db) => {
    const rows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          inArray(users.role, ["admin", "staff"]),
        ),
      );
    return Number(rows[0]?.count ?? 0);
  }, 0);
}

export async function createStaffInvite(entry: {
  tenantId: number;
  email: string;
  token: string;
  invitedByUserId?: number;
  expiresAt: Date;
}): Promise<void> {
  await withDbOrThrow((db) =>
    db.insert(staffInvites).values({
      tenantId: entry.tenantId,
      email: entry.email,
      token: entry.token,
      invitedByUserId: entry.invitedByUserId ?? null,
      expiresAt: entry.expiresAt,
    }),
  );
}

/** Pending (not yet accepted, not yet expired) invites — these hold seats. */
export async function getPendingStaffInvites(
  tenantId: number,
): Promise<StaffInvite[]> {
  return withDb(async (db) => {
    return db
      .select()
      .from(staffInvites)
      .where(
        and(
          eq(staffInvites.tenantId, tenantId),
          isNull(staffInvites.acceptedAt),
          gt(staffInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(staffInvites.createdAt));
  }, []);
}

export async function getStaffInviteByToken(
  token: string,
): Promise<StaffInvite | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select()
      .from(staffInvites)
      .where(eq(staffInvites.token, token))
      .limit(1);
    return rows[0];
  }, undefined);
}

export async function markStaffInviteAccepted(id: number): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(staffInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(staffInvites.id, id)),
  );
}

export async function deleteStaffInvite(
  id: number,
  tenantId: number,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .delete(staffInvites)
      .where(and(eq(staffInvites.id, id), eq(staffInvites.tenantId, tenantId))),
  );
}

/**
 * Move a user into a tenant as staff (invite claim). Only ever upgrades to
 * the staff role on the target tenant — never used to move between tenants.
 */
export async function joinTenantAsStaff(
  userId: number,
  tenantId: number,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(users)
      .set({ tenantId, role: "staff" })
      .where(eq(users.id, userId)),
  );
}
