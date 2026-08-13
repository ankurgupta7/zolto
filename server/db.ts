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
  type MagicLinkToken,
  magicLinkTokens,
  type Order,
  orders,
  type PhotoCreditLedgerEntry,
  photoCreditLedger,
  type PosAttribution,
  rateLimitWindows,
  type StaffInvite,
  staffInvites,
  storageObjects,
  posAttributions,
  posOrderItems,
  posOrders,
  posPairingTokens,
  type Product,
  productImages,
  products,
  type SiteImport,
  siteImports,
  type StripeReconciliation,
  stripeReconciliations,
  users,
  tenants,
  tenantSettings,
  tenantCategories,
  type Tenant,
  type TenantCategory,
  type TenantSetting,
} from "../drizzle/schema";
import { VERTICAL_PRESETS, isVertical, type Vertical } from "@shared/verticals";
import { ENV } from "./_core/env";
import { PLANS } from "@shared/platform";
import { effectivePlan } from "@shared/entitlements";
import { hashPosApiKey } from "./posApiKey";
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

// ─── Magic link tokens (passwordless email sign-in) ────────────────────────────

export async function createMagicLinkToken(entry: {
  email: string;
  token: string;
  next: string | null;
  expiresAt: Date;
}): Promise<void> {
  await withDbOrThrow((db) =>
    db.insert(magicLinkTokens).values({
      email: entry.email,
      token: entry.token,
      next: entry.next,
      expiresAt: entry.expiresAt,
    }),
  );
}

export async function getMagicLinkTokenByToken(
  token: string,
): Promise<MagicLinkToken | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.token, token))
      .limit(1);
    return rows[0];
  }, undefined);
}

export async function consumeMagicLinkToken(id: number): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(magicLinkTokens)
      .set({ consumedAt: new Date() })
      .where(eq(magicLinkTokens.id, id)),
  );
}

// ─── POS pairing tokens (one-tap register setup) ───────────────────────────────

export async function createPosPairingToken(entry: {
  tenantId: number;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  await withDbOrThrow((db) =>
    db.insert(posPairingTokens).values({
      tenantId: entry.tenantId,
      token: entry.token,
      expiresAt: entry.expiresAt,
    }),
  );
}

/**
 * Claim a pairing token: marks it consumed and reports the tenant it belonged
 * to, or undefined if it was unknown, expired or already spent.
 *
 * Single-use is enforced by the UPDATE's own WHERE clause rather than by
 * reading the row and then writing it — two registers opening the same link at
 * the same moment would both pass a read-then-write check, and both would get
 * live credentials. Here the second UPDATE matches zero rows and is refused.
 */
export async function claimPosPairingToken(
  tokenHash: string,
): Promise<{ tenantId: number } | undefined> {
  return withDb(async (db) => {
    const now = new Date();
    const result = await db
      .update(posPairingTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(posPairingTokens.token, tokenHash),
          isNull(posPairingTokens.consumedAt),
          gt(posPairingTokens.expiresAt, now),
        ),
      );
    // mysql2 reports how many rows the WHERE actually matched. Zero means some
    // other request won the race, or the token was never valid.
    const affected = (result as unknown as Array<{ affectedRows?: number }>)[0]
      ?.affectedRows;
    if (!affected) return undefined;

    const rows = await db
      .select({ tenantId: posPairingTokens.tenantId })
      .from(posPairingTokens)
      .where(eq(posPairingTokens.token, tokenHash))
      .limit(1);
    return rows[0];
  }, undefined);
}

/** Housekeeping: drop spent and expired pairing tokens. */
export async function deleteStalePosPairingTokens(): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .delete(posPairingTokens)
      .where(
        or(
          isNotNull(posPairingTokens.consumedAt),
          lt(posPairingTokens.expiresAt, new Date()),
        ),
      ),
  );
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
  const row = withTenant(data);
  // Scale metering (two-tier pricing): plans cap catalogue size, never AI
  // usage (shared/platform.ts PLANS[].maxProducts). Enforced at this single
  // choke point so every intake channel — admin UI, CSV import, bulk photo
  // upload, Discord/WhatsApp/Slack — hits the same limit. Fails open when
  // the tenant row can't be loaded so a broken lookup never blocks writes.
  // effectivePlan, not tenant.plan: a store the operator has comped onto Pro
  // gets Pro's catalogue room (shared/entitlements.ts).
  const tenant = await getTenantById(row.tenantId);
  const plan = tenant ? effectivePlan(tenant) : undefined;
  const cap = plan ? PLANS.find((p) => p.id === plan)?.maxProducts : undefined;
  if (cap !== undefined) {
    const count = await countTenantProducts(row.tenantId);
    if (count >= cap) {
      throw new Error(
        `Your catalogue is at its ${cap}-product limit on the ${plan} plan — upgrade for more room.`,
      );
    }
  }
  return withDbOrThrow((db) => db.insert(products).values(row));
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

// Deleting an image releases its storage quota. Without this a merchant who
// cleared their catalogue would still be billed, in allowance terms, for photos
// that no longer exist — and would eventually be unable to upload anything at
// all. The S3 object itself is left in place (nothing else reclaims it today);
// what is freed here is the merchant's plan allowance.
export async function deleteProductImage(tenantId: number, id: number) {
  const keys = await withDbOrThrow((db) =>
    db
      .select({ imageKey: productImages.imageKey })
      .from(productImages)
      .where(
        and(eq(productImages.tenantId, tenantId), eq(productImages.id, id)),
      ),
  );
  await withDbOrThrow((db) =>
    db
      .delete(productImages)
      .where(
        and(eq(productImages.tenantId, tenantId), eq(productImages.id, id)),
      ),
  );
  for (const { imageKey } of keys) {
    await forgetStorageObject(tenantId, imageKey);
  }
}

export async function deleteAllProductImages(
  tenantId: number,
  productId: number,
) {
  const keys = await withDbOrThrow((db) =>
    db
      .select({ imageKey: productImages.imageKey })
      .from(productImages)
      .where(
        and(
          eq(productImages.tenantId, tenantId),
          eq(productImages.productId, productId),
        ),
      ),
  );
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
  for (const { imageKey } of keys) {
    await forgetStorageObject(tenantId, imageKey);
  }
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

/**
 * This calendar month's (UTC) paid ONLINE + AGENT sales, for the skim-vs-Pro
 * upsell: total GMV, the platform fees actually taken, and the agent-channel
 * split. In-person (POS) sales live elsewhere and never enter this number.
 */
export async function getMonthlyOnlineSales(tenantId: number): Promise<{
  gmvRappen: number;
  feeRappen: number;
  agentGmvRappen: number;
  orderCount: number;
}> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  return withDb(
    async (db) => {
      const rows = await db
        .select({
          gmvRappen: sql<number>`COALESCE(SUM(${orders.amountTotal}), 0)`,
          feeRappen: sql<number>`COALESCE(SUM(${orders.platformFeeRappen}), 0)`,
          agentGmvRappen: sql<number>`COALESCE(SUM(CASE WHEN ${orders.channel} = 'agent' THEN ${orders.amountTotal} ELSE 0 END), 0)`,
          orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            eq(orders.status, "paid"),
            gte(orders.createdAt, monthStart),
          ),
        );
      const r = rows[0];
      return {
        gmvRappen: Number(r?.gmvRappen ?? 0),
        feeRappen: Number(r?.feeRappen ?? 0),
        agentGmvRappen: Number(r?.agentGmvRappen ?? 0),
        orderCount: Number(r?.orderCount ?? 0),
      };
    },
    { gmvRappen: 0, feeRappen: 0, agentGmvRappen: 0, orderCount: 0 },
  );
}

/**
 * Platform-wide metrics for the operator (superadmin), for the current
 * calendar month in UTC.
 *
 * The headline number is the one the pricing model lives or dies on
 * (docs/planning/pricing-pivot-agent-commerce.md §5): **what share of free
 * in-person vendors make at least one online or agent sale in a month.** A
 * free vendor who only ever sells at their stall pays Zolto CHF 0 forever, by
 * design — so this ratio, not signups, is the business.
 *
 * "In-person vendor" means a tenant with a paid POS order this month;
 * in-person sales live in pos_orders and never carry a platform fee, while
 * online/agent sales live in orders with a channel. That separation is what
 * makes the ratio computable at all.
 */
export interface PlatformMetrics {
  month: string;
  tenants: { total: number; free: number; pro: number };
  /** The north star, plus the counts it is derived from. */
  northStar: {
    freeInPersonVendors: number;
    freeInPersonVendorsSellingOnline: number;
    /** Percentage, 0-100, rounded to one decimal. Null when there are none. */
    conversionPct: number | null;
  };
  online: {
    gmvChf: number;
    feeChf: number;
    orders: number;
    /** Agent-originated subset — the differentiator, tracked separately. */
    agentGmvChf: number;
    agentOrders: number;
    sellingTenants: number;
  };
  inPerson: { gmvChf: number; orders: number; sellingTenants: number };
  subscriptions: {
    active: number;
    trialing: number;
    pastDue: number;
    canceled: number;
  };
}

/**
 * Publicly discoverable storefronts, for the platform's agent-facing directory
 * (`find_stores` in server/mcp.ts).
 *
 * Only stores that already have something to sell are listed — a tenant with
 * no visible, in-stock products would be a dead end for an agent and a bad
 * first impression for the merchant. Nothing here is private: it is the same
 * information a web crawler gets from the storefront, and "be found by AI
 * assistants" is the platform's advertised value proposition
 * (shared/platform.ts FEATURES). If a merchant ever asks to be delisted, that
 * belongs in tenant_settings as an explicit opt-out rather than here.
 */
/**
 * Per-category price statistics for one merchant's own live catalogue.
 *
 * Grounds the AI's price suggestion in what THIS merchant already charges,
 * rather than letting a model guess a market price from a photo. A brand-new
 * store returns nothing, and the caller must then suggest nothing at all —
 * an invented price is worse than an empty field, because the merchant may
 * accept it and mis-price their own work.
 */
export async function getCategoryPriceStats(tenantId: number): Promise<
  {
    category: string;
    count: number;
    minChf: number;
    maxChf: number;
    medianChf: number;
  }[]
> {
  return withDb(async (db) => {
    const rows = await db
      .select({ category: products.category, price: products.price })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.visible, true)));

    const byCategory = new Map<string, number[]>();
    for (const r of rows) {
      const price = Number(r.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const list = byCategory.get(r.category) ?? [];
      list.push(price);
      byCategory.set(r.category, list);
    }

    return Array.from(byCategory.entries()).map(([category, prices]) => {
      prices.sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      // Median, not mean: one CHF 900 statement piece shouldn't drag the
      // suggestion for a CHF 45 pair of studs.
      const medianChf =
        prices.length % 2 === 0
          ? (prices[mid - 1] + prices[mid]) / 2
          : prices[mid];
      return {
        category,
        count: prices.length,
        minChf: prices[0],
        maxChf: prices[prices.length - 1],
        medianChf: Math.round(medianChf * 100) / 100,
      };
    });
  }, []);
}

export async function getPublicStores(limit = 100): Promise<
  {
    slug: string;
    name: string;
    customDomain: string | null;
    productCount: number;
  }[]
> {
  return withDb(async (db) => {
    const rows = await db
      .select({
        slug: tenants.slug,
        name: tenants.name,
        customDomain: tenantSettings.publicDomain,
        productCount: sql<number>`COUNT(${products.id})`,
      })
      .from(tenants)
      .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
      .innerJoin(
        products,
        and(
          eq(products.tenantId, tenants.id),
          eq(products.visible, true),
          eq(products.sold, false),
          gt(products.quantity, 0),
          isNotNull(products.imageUrl),
        ),
      )
      .groupBy(
        tenants.id,
        tenants.slug,
        tenants.name,
        tenantSettings.publicDomain,
      )
      .orderBy(desc(sql`COUNT(${products.id})`))
      .limit(limit);
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      customDomain: r.customDomain ?? null,
      productCount: Number(r.productCount),
    }));
  }, []);
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const month = monthStart.toISOString().slice(0, 7);

  const empty: PlatformMetrics = {
    month,
    tenants: { total: 0, free: 0, pro: 0 },
    northStar: {
      freeInPersonVendors: 0,
      freeInPersonVendorsSellingOnline: 0,
      conversionPct: null,
    },
    online: {
      gmvChf: 0,
      feeChf: 0,
      orders: 0,
      agentGmvChf: 0,
      agentOrders: 0,
      sellingTenants: 0,
    },
    inPerson: { gmvChf: 0, orders: 0, sellingTenants: 0 },
    subscriptions: { active: 0, trialing: 0, pastDue: 0, canceled: 0 },
  };

  return withDb(async (db) => {
    const [
      planRows,
      statusRows,
      onlineRows,
      posRows,
      onlineTenants,
      posTenants,
    ] = await Promise.all([
      db
        .select({ plan: tenants.plan, n: sql<number>`COUNT(*)` })
        .from(tenants)
        .groupBy(tenants.plan),
      db
        .select({
          status: tenants.subscriptionStatus,
          n: sql<number>`COUNT(*)`,
        })
        .from(tenants)
        .groupBy(tenants.subscriptionStatus),
      db
        .select({
          gmv: sql<number>`COALESCE(SUM(${orders.amountTotal}), 0)`,
          fee: sql<number>`COALESCE(SUM(${orders.platformFeeRappen}), 0)`,
          n: sql<number>`COUNT(*)`,
          agentGmv: sql<number>`COALESCE(SUM(CASE WHEN ${orders.channel} = 'agent' THEN ${orders.amountTotal} ELSE 0 END), 0)`,
          agentN: sql<number>`COALESCE(SUM(CASE WHEN ${orders.channel} = 'agent' THEN 1 ELSE 0 END), 0)`,
        })
        .from(orders)
        .where(
          and(eq(orders.status, "paid"), gte(orders.createdAt, monthStart)),
        ),
      db
        .select({
          gmv: sql<number>`COALESCE(SUM(${posOrders.totalRappen}), 0)`,
          n: sql<number>`COUNT(*)`,
        })
        .from(posOrders)
        .where(
          and(
            eq(posOrders.status, "paid"),
            gte(posOrders.createdAt, monthStart),
          ),
        ),
      // Distinct tenants selling through each channel this month. Kept as id
      // lists (not just counts) because the north star is an INTERSECTION —
      // the same vendor must appear in both to count.
      db
        .selectDistinct({ tenantId: orders.tenantId })
        .from(orders)
        .where(
          and(eq(orders.status, "paid"), gte(orders.createdAt, monthStart)),
        ),
      db
        .selectDistinct({ tenantId: posOrders.tenantId })
        .from(posOrders)
        .where(
          and(
            eq(posOrders.status, "paid"),
            gte(posOrders.createdAt, monthStart),
          ),
        ),
    ]);

    const freeTenantIds = new Set(
      (
        await db
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.plan, "free"))
      ).map((r) => r.id),
    );

    const onlineIds = new Set(onlineTenants.map((r) => r.tenantId));
    const posIds = new Set(posTenants.map((r) => r.tenantId));

    // The denominator is free vendors who actually sold in person this month —
    // not every free signup. A tenant who sold nothing anywhere is dormant,
    // and counting them would flatter or depress the ratio for the wrong
    // reason.
    const freeInPerson = Array.from(posIds).filter((id) =>
      freeTenantIds.has(id),
    );
    const converted = freeInPerson.filter((id) => onlineIds.has(id));

    const planCounts = Object.fromEntries(
      planRows.map((r) => [r.plan, Number(r.n)]),
    );
    const statusCounts = Object.fromEntries(
      statusRows.map((r) => [r.status ?? "unknown", Number(r.n)]),
    );
    const o = onlineRows[0];
    const p = posRows[0];

    return {
      month,
      tenants: {
        total: planRows.reduce((sum, r) => sum + Number(r.n), 0),
        free: planCounts.free ?? 0,
        pro: planCounts.pro ?? 0,
      },
      northStar: {
        freeInPersonVendors: freeInPerson.length,
        freeInPersonVendorsSellingOnline: converted.length,
        conversionPct:
          freeInPerson.length === 0
            ? null
            : Math.round((converted.length / freeInPerson.length) * 1000) / 10,
      },
      online: {
        gmvChf: Number(o?.gmv ?? 0) / 100,
        feeChf: Number(o?.fee ?? 0) / 100,
        orders: Number(o?.n ?? 0),
        agentGmvChf: Number(o?.agentGmv ?? 0) / 100,
        agentOrders: Number(o?.agentN ?? 0),
        sellingTenants: onlineIds.size,
      },
      inPerson: {
        gmvChf: Number(p?.gmv ?? 0) / 100,
        orders: Number(p?.n ?? 0),
        sellingTenants: posIds.size,
      },
      subscriptions: {
        active: statusCounts.active ?? 0,
        trialing: statusCounts.trialing ?? 0,
        pastDue: statusCounts.past_due ?? 0,
        canceled: statusCounts.canceled ?? 0,
      },
    };
  }, empty);
}

/**
 * Every store on the platform, for the operator console (superadmin only).
 *
 * Deliberately NOT a `select *`: the POS API key hash is a bearer credential
 * and must never leave the server, so the columns are named explicitly rather
 * than stripped after the fact — a new secret column added to `tenants` then
 * cannot leak by default. `adminCount` is here because the single most common
 * support ticket is "I can't press any admin button", whose usual cause is a
 * store with users but zero admins (see deploy/tenant-admin.sh).
 */
export interface OperatorTenantRow {
  id: number;
  slug: string;
  name: string;
  domain: string | null;
  plan: "free" | "pro";
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  /** Presence only — the account id itself is not the operator's business. */
  stripeConnected: boolean;
  /**
   * What this store has been given on the house — null for every ordinary
   * store. `plan` is the granted plan (`tenants.comp_plan`), NOT the paid one
   * above; shared/entitlements.ts resolves the pair.
   */
  comp: {
    plan: "free" | "pro" | null;
    feeWaived: boolean;
    note: string | null;
    grantedAt: Date | null;
  } | null;
  /** Users on this tenant with role admin or superadmin. */
  adminCount: number;
  /** Users on this tenant of any role. */
  userCount: number;
}

/**
 * The comp columns as the console renders them, or null when there is nothing
 * to render. Shared by the list and the detail so the two cannot disagree about
 * whether a store is on the house.
 */
function compSummary(row: {
  compPlan: "free" | "pro" | null;
  compFeeWaived: boolean;
  compNote: string | null;
  compGrantedAt: Date | null;
}): OperatorTenantRow["comp"] {
  if (!row.compPlan && !row.compFeeWaived) return null;
  return {
    plan: row.compPlan,
    feeWaived: row.compFeeWaived,
    note: row.compNote,
    grantedAt: row.compGrantedAt,
  };
}

export async function listTenantsForOperator(): Promise<OperatorTenantRow[]> {
  return withDb(async (db) => {
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        domain: tenants.domain,
        plan: tenants.plan,
        subscriptionStatus: tenants.subscriptionStatus,
        trialEndsAt: tenants.trialEndsAt,
        createdAt: tenants.createdAt,
        stripeConnectedAccountId: tenants.stripeConnectedAccountId,
        compPlan: tenants.compPlan,
        compFeeWaived: tenants.compFeeWaived,
        compNote: tenants.compNote,
        compGrantedAt: tenants.compGrantedAt,
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt));

    // One grouped pass rather than a query per tenant — the operator list is
    // the one page that reads every store at once.
    const counts = await db
      .select({
        tenantId: users.tenantId,
        userCount: sql<number>`COUNT(*)`,
        adminCount: sql<number>`SUM(${users.role} IN ('admin','superadmin'))`,
      })
      .from(users)
      .groupBy(users.tenantId);

    const byTenant = new Map(
      counts.map((c) => [
        Number(c.tenantId),
        { userCount: Number(c.userCount), adminCount: Number(c.adminCount) },
      ]),
    );

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      domain: r.domain,
      plan: r.plan,
      subscriptionStatus: r.subscriptionStatus,
      trialEndsAt: r.trialEndsAt,
      createdAt: r.createdAt,
      stripeConnected: Boolean(r.stripeConnectedAccountId),
      comp: compSummary(r),
      adminCount: byTenant.get(r.id)?.adminCount ?? 0,
      userCount: byTenant.get(r.id)?.userCount ?? 0,
    }));
  }, []);
}

/**
 * One store, as the operator needs to see it when a merchant is stuck.
 *
 * The user list is the point: the most common unfixable-looking ticket is a
 * store whose owner signed in but never redeemed their claim token, leaving a
 * tenant with users and no admin. `pendingClaim` marks the placeholder rows
 * that claim flow leaves behind (openId `pending:…`), because an operator
 * looking at a list of emails otherwise cannot tell which of them is a real
 * signed-in account.
 */
export interface OperatorTenantUser {
  id: number;
  email: string | null;
  name: string | null;
  role: "superadmin" | "admin" | "staff" | "customer";
  loginMethod: string | null;
  pendingClaim: boolean;
  lastSignedIn: Date | null;
}

export interface OperatorTenantDetail {
  tenant: OperatorTenantRow & {
    onboardingStep: number | null;
    referralCode: string | null;
  };
  users: OperatorTenantUser[];
}

export async function getTenantDetailForOperator(
  tenantId: number,
): Promise<OperatorTenantDetail | null> {
  return withDb(async (db) => {
    const [row] = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        domain: tenants.domain,
        plan: tenants.plan,
        subscriptionStatus: tenants.subscriptionStatus,
        trialEndsAt: tenants.trialEndsAt,
        createdAt: tenants.createdAt,
        stripeConnectedAccountId: tenants.stripeConnectedAccountId,
        compPlan: tenants.compPlan,
        compFeeWaived: tenants.compFeeWaived,
        compNote: tenants.compNote,
        compGrantedAt: tenants.compGrantedAt,
        onboardingStep: tenants.onboardingStep,
        referralCode: tenants.referralCode,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!row) return null;

    const staff = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        openId: users.openId,
        loginMethod: users.loginMethod,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(asc(users.id));

    const mapped: OperatorTenantUser[] = staff.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      loginMethod: u.loginMethod,
      pendingClaim: u.openId.startsWith("pending:"),
      lastSignedIn: u.lastSignedIn,
    }));

    return {
      tenant: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        domain: row.domain,
        plan: row.plan,
        subscriptionStatus: row.subscriptionStatus,
        trialEndsAt: row.trialEndsAt,
        createdAt: row.createdAt,
        stripeConnected: Boolean(row.stripeConnectedAccountId),
        comp: compSummary(row),
        adminCount: mapped.filter(
          (u) => u.role === "admin" || u.role === "superadmin",
        ).length,
        userCount: mapped.length,
        onboardingStep: row.onboardingStep,
        referralCode: row.referralCode,
      },
      users: mapped,
    };
  }, null);
}

/**
 * Operator fix for the "no admin on this store" ticket — the same repair
 * deploy/tenant-admin.sh --promote performs, moved into the console so it does
 * not require SSH.
 *
 * Scoped by tenant AND user id together: promoting by email alone (as the shell
 * script must) can hit the wrong row when an address appears on two tenants,
 * and this is a privilege grant, so it refuses rather than guesses. Never
 * grants superadmin — platform ownership stays a deliberate server-side act.
 */
export async function setTenantUserRoleByOperator(
  tenantId: number,
  userId: number,
  role: "admin" | "staff",
): Promise<boolean> {
  return withDb(async (db) => {
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!target) return false;

    await db
      .update(users)
      .set({ role })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    return true;
  }, false);
}

/**
 * Move a store between plans by hand.
 *
 * Touches `tenants.plan` only — never the Stripe subscription. A comp'd store,
 * a refund case, or a merchant Stripe has not caught up with all need the
 * entitlement changed without inventing billing state the payment processor
 * disagrees with. Whoever uses this owns reconciling Stripe separately.
 */
export async function setTenantPlanByOperator(
  tenantId: number,
  plan: "free" | "pro",
): Promise<boolean> {
  return withDb(async (db) => {
    const [target] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!target) return false;

    await db.update(tenants).set({ plan }).where(eq(tenants.id, tenantId));
    return true;
  }, false);
}

/**
 * Put a store on the house — or take it off again.
 *
 * `plan` here is the plan GRANTED, written to `comp_plan`; the store's own
 * `tenants.plan` is deliberately untouched, because that column is Stripe's
 * (server/billing.ts writes it from subscription webhooks). Keeping the grant
 * in its own column is what stops a cancelled subscription arriving late from
 * silently revoking a comp, and what stops revoking a comp from taking away a
 * plan the merchant actually pays for — shared/entitlements.ts resolves the two
 * into one answer for every gate.
 *
 * Passing `plan: null` and `feeWaived: false` revokes the comp entirely and
 * clears its provenance, so a revoked store is indistinguishable from one that
 * was never comped.
 */
export async function setTenantCompByOperator(args: {
  tenantId: number;
  plan: "free" | "pro" | null;
  feeWaived: boolean;
  note?: string | null;
  grantedByUserId?: number | null;
}): Promise<boolean> {
  return withDb(async (db) => {
    const [target] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, args.tenantId))
      .limit(1);
    if (!target) return false;

    const revoking = args.plan === null && !args.feeWaived;
    await db
      .update(tenants)
      .set({
        compPlan: args.plan,
        compFeeWaived: args.feeWaived,
        compNote: revoking ? null : args.note?.trim() || null,
        compGrantedAt: revoking ? null : new Date(),
        compGrantedBy: revoking ? null : (args.grantedByUserId ?? null),
      })
      .where(eq(tenants.id, args.tenantId));
    return true;
  }, false);
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

// The three "already known to us" sets below back Stripe reconciliation.
// `tenantId` scopes them to one store; omitting it keeps the platform-wide
// behaviour for the superadmin sweep. Scoping matters less for correctness
// than it looks (PaymentIntent ids are globally unique, and an intent on one
// tenant's connected account can never appear in another's list) and more for
// size: without it every tenant loads every other tenant's id set.
export async function getKnownOrderPaymentIntentIds(
  tenantId?: number,
): Promise<Set<string>> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: orders.stripePaymentIntentId })
      .from(orders)
      .where(
        and(
          isNotNull(orders.stripePaymentIntentId),
          ...(tenantId === undefined ? [] : [eq(orders.tenantId, tenantId)]),
        ),
      );
    return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
  }, new Set<string>());
}

export async function getKnownPosPaymentIntentIds(
  tenantId?: number,
): Promise<Set<string>> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: posOrders.stripePaymentIntentId })
      .from(posOrders)
      .where(
        and(
          isNotNull(posOrders.stripePaymentIntentId),
          ...(tenantId === undefined ? [] : [eq(posOrders.tenantId, tenantId)]),
        ),
      );
    return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
  }, new Set<string>());
}

export async function getKnownReconciliationPaymentIntentIds(
  tenantId?: number,
): Promise<Set<string>> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: stripeReconciliations.stripePaymentIntentId })
      .from(stripeReconciliations)
      .where(
        tenantId === undefined
          ? undefined
          : eq(stripeReconciliations.tenantId, tenantId),
      );
    return new Set(rows.map((r) => r.id));
  }, new Set<string>());
}

// Every tenant that has linked their own Stripe account — the population the
// platform-wide reconciliation sweep iterates. A tenant without a connected
// account has no payments of its own to reconcile.
export async function getTenantsWithConnectedStripe(): Promise<
  { id: number; slug: string; name: string; stripeConnectedAccountId: string }[]
> {
  return withDb(async (db) => {
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        stripeConnectedAccountId: tenants.stripeConnectedAccountId,
      })
      .from(tenants)
      .where(isNotNull(tenants.stripeConnectedAccountId))
      .orderBy(asc(tenants.id));
    return rows.filter(
      (r): r is (typeof rows)[number] & { stripeConnectedAccountId: string } =>
        Boolean(r.stripeConnectedAccountId),
    );
  }, []);
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
// `tenantId` scopes the scan to one store. It is optional only so the
// platform-wide sweep (a superadmin/cron use) stays expressible; every
// merchant-triggered run MUST pass it, or one store's admin kicks off a job
// that writes pos_attributions rows for every other store on the platform.
export async function getUnattributedPosLineItems(
  since: Date,
  tenantId?: number,
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
          ...(tenantId === undefined
            ? []
            : [eq(posOrderItems.tenantId, tenantId)]),
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

/**
 * The tenant whose WhatsApp business number received a message, with its
 * settings row — one lookup serving both webhook signature verification
 * (which needs the tenant BEFORE trusting the payload's content) and the
 * intake handler's branding.
 */
export async function getTenantByWhatsappNumber(
  businessPhone: string,
): Promise<{ tenant: Tenant; settings: TenantSetting | null } | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select({ tenant: tenants, settings: tenantSettings })
      .from(tenants)
      .leftJoin(tenantSettings, eq(tenants.id, tenantSettings.tenantId))
      .where(eq(tenantSettings.whatsappNumber, businessPhone))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
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

// Raw storage for server/rateLimit.ts's shared fixed-window counter — the
// window-boundary decision (allowed/remaining/retryAfter) lives there, this
// just does the atomic upsert-and-read. Reuses the SAME row across windows
// (upsert on the unique limit_key, not an insert-per-window), so an
// abandoned key leaves exactly one skinny row behind rather than growing
// without bound. Returns null on any DB error so the caller can fail open —
// a rate limiter guarding against catalogue-hoarding abuse must never itself
// become a reason every checkout on the platform fails.
export async function getOrCreateRateLimitWindow(
  key: string,
  now: number,
  windowMs: number,
): Promise<{ count: number; resetAt: number } | null> {
  return withDb(async (db) => {
    const resetAt = now + windowMs;
    await db
      .insert(rateLimitWindows)
      .values({ limitKey: key, count: 1, resetAt })
      .onDuplicateKeyUpdate({
        set: {
          count: sql`IF(${rateLimitWindows.resetAt} <= ${now}, 1, ${rateLimitWindows.count} + 1)`,
          resetAt: sql`IF(${rateLimitWindows.resetAt} <= ${now}, ${resetAt}, ${rateLimitWindows.resetAt})`,
        },
      });
    const rows = await db
      .select()
      .from(rateLimitWindows)
      .where(eq(rateLimitWindows.limitKey, key))
      .limit(1);
    const row = rows[0];
    return row
      ? { count: row.count, resetAt: Number(row.resetAt) }
      : { count: 1, resetAt };
  }, null);
}

export async function clearRateLimitWindows(): Promise<void> {
  await withDb(async (db) => {
    await db.delete(rateLimitWindows);
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
// key or when the database is unavailable. The key is a bearer credential, so
// tenants.pos_api_key stores only its SHA-256 — the presented plaintext is
// hashed here and never persisted (see server/posApiKey.ts).
export async function getTenantByPosApiKey(
  apiKey: string,
): Promise<Tenant | undefined> {
  const keyHash = hashPosApiKey(apiKey);
  return withDb(async (db) => {
    const result = await db
      .select()
      .from(tenants)
      .where(eq(tenants.posApiKey, keyHash))
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

/**
 * Patch a store's settings by tenant id, creating the row if it is missing.
 *
 * tenant.updateSettings does this inline off `ctx.tenant`; this exists for the
 * callers that are scoped through `ctx.user.tenantId` instead — the shape
 * CLAUDE.md's authorization table calls the correct use of bare
 * `adminProcedure` — so they never have to reach for the request's host to
 * decide whose settings they are writing.
 */
export async function upsertTenantSettingsFields(
  tenantId: number,
  patch: Partial<InsertTenantSetting>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withDbOrThrow(async (db) => {
    const existing = await db
      .select({ id: tenantSettings.id })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);
    if (existing[0]) {
      await db
        .update(tenantSettings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(tenantSettings.id, existing[0].id));
    } else {
      await db.insert(tenantSettings).values({ ...patch, tenantId });
    }
  });
}

// ─── Tenant categories ────────────────────────────────────────────────────────
// Per-store product category list, seeded from the tenant's vertical preset
// at signup and editable by the store admin. products.category stores the
// `key`; labels are display-only.

function presetCategoryRows(
  tenantId: number,
  vertical: Vertical,
): Array<typeof tenantCategories.$inferInsert> {
  return VERTICAL_PRESETS[vertical].categories.map((c, i) => ({
    tenantId,
    key: c.key,
    labelEn: c.labelEn,
    labelDe: c.labelDe,
    labelFr: c.labelFr,
    labelIt: c.labelIt,
    extraIncludes: c.extraIncludes ? [...c.extraIncludes] : null,
    sortOrder: i,
  }));
}

/**
 * The tenant's categories in display order. Falls back to the tenant's
 * vertical preset (read-only, no lazy write) when no rows exist yet — a
 * safety net for tenants created before seeding existed and for tests.
 */
export async function getTenantCategories(
  tenantId: number,
): Promise<TenantCategory[]> {
  const rows = await withDb(
    async (db) =>
      db
        .select()
        .from(tenantCategories)
        .where(eq(tenantCategories.tenantId, tenantId))
        .orderBy(asc(tenantCategories.sortOrder), asc(tenantCategories.id)),
    [] as TenantCategory[],
  );
  if (rows.length > 0) return rows;

  const settings = await getTenantSettings(tenantId);
  const vertical =
    settings?.vertical && isVertical(settings.vertical)
      ? settings.vertical
      : "jewellery";
  return presetCategoryRows(tenantId, vertical).map((r, i) => ({
    id: -(i + 1), // sentinel: not persisted
    tenantId,
    key: r.key,
    labelEn: r.labelEn,
    labelDe: r.labelDe ?? null,
    labelFr: r.labelFr ?? null,
    labelIt: r.labelIt ?? null,
    extraIncludes: r.extraIncludes ?? null,
    sortOrder: r.sortOrder ?? i,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

/** Seed the tenant's category list from a vertical preset. Skips existing keys. */
export async function seedTenantCategories(
  tenantId: number,
  vertical: Vertical,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .insert(tenantCategories)
      .values(presetCategoryRows(tenantId, vertical))
      .onDuplicateKeyUpdate({ set: { tenantId: sql`tenant_id` } }),
  );
}

export async function createTenantCategoryRow(row: {
  tenantId: number;
  key: string;
  labelEn: string;
  labelDe?: string | null;
  labelFr?: string | null;
  labelIt?: string | null;
  extraIncludes?: string[] | null;
  sortOrder?: number;
}): Promise<void> {
  await withDbOrThrow(async (db) => {
    const sortOrder =
      row.sortOrder ??
      (await db
        .select({
          max: sql<number>`COALESCE(MAX(${tenantCategories.sortOrder}), -1)`,
        })
        .from(tenantCategories)
        .where(eq(tenantCategories.tenantId, row.tenantId))
        .then((r) => (r[0]?.max ?? -1) + 1));
    await db.insert(tenantCategories).values({ ...row, sortOrder });
  });
}

export async function updateTenantCategoryLabels(
  tenantId: number,
  key: string,
  labels: {
    labelEn?: string;
    labelDe?: string | null;
    labelFr?: string | null;
    labelIt?: string | null;
  },
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(tenantCategories)
      .set(labels)
      .where(
        and(
          eq(tenantCategories.tenantId, tenantId),
          eq(tenantCategories.key, key),
        ),
      ),
  );
}

/**
 * Rename a category KEY, cascading in one transaction to every product in
 * that category and to any sibling extraIncludes arrays referencing it.
 */
export async function renameTenantCategoryKey(
  tenantId: number,
  oldKey: string,
  newKey: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.transaction(async (tx) => {
      await tx
        .update(tenantCategories)
        .set({ key: newKey })
        .where(
          and(
            eq(tenantCategories.tenantId, tenantId),
            eq(tenantCategories.key, oldKey),
          ),
        );
      await tx
        .update(products)
        .set({ category: newKey })
        .where(
          and(eq(products.tenantId, tenantId), eq(products.category, oldKey)),
        );
      const siblings = await tx
        .select()
        .from(tenantCategories)
        .where(eq(tenantCategories.tenantId, tenantId));
      for (const sib of siblings) {
        if (sib.extraIncludes?.includes(oldKey)) {
          await tx
            .update(tenantCategories)
            .set({
              extraIncludes: sib.extraIncludes.map((k) =>
                k === oldKey ? newKey : k,
              ),
            })
            .where(eq(tenantCategories.id, sib.id));
        }
      }
    }),
  );
}

/**
 * Delete a category, reassigning its products to `reassignTo` (also cleans
 * the deleted key out of sibling extraIncludes arrays) in one transaction.
 */
export async function deleteTenantCategoryRow(
  tenantId: number,
  key: string,
  reassignTo: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ category: reassignTo })
        .where(
          and(eq(products.tenantId, tenantId), eq(products.category, key)),
        );
      await tx
        .delete(tenantCategories)
        .where(
          and(
            eq(tenantCategories.tenantId, tenantId),
            eq(tenantCategories.key, key),
          ),
        );
      const siblings = await tx
        .select()
        .from(tenantCategories)
        .where(eq(tenantCategories.tenantId, tenantId));
      for (const sib of siblings) {
        if (sib.extraIncludes?.includes(key)) {
          const cleaned = sib.extraIncludes.filter((k) => k !== key);
          await tx
            .update(tenantCategories)
            .set({ extraIncludes: cleaned.length ? cleaned : null })
            .where(eq(tenantCategories.id, sib.id));
        }
      }
    }),
  );
}

/** Reorder categories: `keys` in the desired order; unlisted keys keep their place after. */
export async function reorderTenantCategories(
  tenantId: number,
  keys: string[],
): Promise<void> {
  await withDbOrThrow((db) =>
    db.transaction(async (tx) => {
      for (let i = 0; i < keys.length; i++) {
        await tx
          .update(tenantCategories)
          .set({ sortOrder: i })
          .where(
            and(
              eq(tenantCategories.tenantId, tenantId),
              eq(tenantCategories.key, keys[i]),
            ),
          );
      }
    }),
  );
}

export async function countProductsInCategory(
  tenantId: number,
  key: string,
): Promise<number> {
  return withDb(
    async (db) =>
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.category, key)))
        .then((r) => Number(r[0]?.count ?? 0)),
    0,
  );
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

/** Stores a NEW POS key hash — takes the SHA-256, never the plaintext. */
export async function setTenantPosApiKeyHash(
  tenantId: number,
  posApiKeyHash: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(tenants)
      .set({ posApiKey: posApiKeyHash })
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

/**
 * The user row that already ties this email to a store, if any — signup's
 * one-email-one-store check. Case-insensitive, because identity providers hand
 * back the address in whatever case the user typed it (the same reason
 * deploy/tenant-admin.sh matches with LOWER()).
 *
 * "Ties to a store" means MANAGES one — role admin/superadmin/staff. The role
 * filter is not an optimization: `users.tenantId` is NOT NULL and every fresh
 * sign-in is parked by upsertUser on DEFAULT_TENANT_ID with role `customer`,
 * so without it, anyone who ever signed in (or shopped at any store) was
 * refused at signup as "already attached to a store" — the opposite of who
 * signup is for.
 *
 * Pending claim rows (openId `pending:…`, role admin) count as taken: they
 * hold a store's admin slot for a signup already in flight, and a second
 * store on the same address while the first is unclaimed is exactly the
 * duplicate this refuses.
 */
export async function getStoreUserByEmail(
  email: string,
): Promise<
  { id: number; tenantId: number; pendingClaim: boolean } | undefined
> {
  return withDb(async (db) => {
    const result = await db
      .select({ id: users.id, tenantId: users.tenantId, openId: users.openId })
      .from(users)
      .where(
        and(
          sql`LOWER(${users.email}) = LOWER(${email})`,
          isNotNull(users.tenantId),
          inArray(users.role, ["superadmin", "admin", "staff"]),
        ),
      )
      .limit(1);
    const row = result[0];
    return row && row.tenantId != null
      ? {
          id: row.id,
          tenantId: row.tenantId,
          // Distinguishes "this email runs a store" from "this email started a
          // signup and never finished claiming it" — signup uses the flag to
          // point the merchant at the recovery path instead of a dead end.
          pendingClaim: row.openId.startsWith("pending:"),
        }
      : undefined;
  }, undefined);
}

/**
 * The unclaimed pending-admin row (openId `pending:<token>`) whose signup email
 * matches, if any — the recovery half of the claim flow. The happy path
 * authorizes the claim with the token from sessionStorage; when that token is
 * gone (new device, cleared storage, a sign-in that failed halfway), this
 * lookup lets `tenant.resumeClaim` find the waiting store by the SIGNED-IN
 * account's provider-verified email instead. Case-insensitive for the same
 * reason as getStoreUserByEmail above.
 */
export async function getPendingTenantAdminByEmail(
  email: string,
): Promise<{ id: number; tenantId: number } | undefined> {
  return withDb(async (db) => {
    const result = await db
      .select({ id: users.id, tenantId: users.tenantId })
      .from(users)
      .where(
        and(
          sql`LOWER(${users.email}) = LOWER(${email})`,
          sql`${users.openId} LIKE 'pending:%'`,
          isNotNull(users.tenantId),
          eq(users.role, "admin"),
        ),
      )
      .limit(1);
    const row = result[0];
    return row && row.tenantId != null
      ? { id: row.id, tenantId: row.tenantId }
      : undefined;
  }, undefined);
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

/**
 * A signed-in user editing their OWN display name.
 *
 * Name only, deliberately. `email` and `openId` are the identity the session
 * was minted against (Google, Apple, or a magic link), so letting a user
 * rewrite their email here would either desync them from their provider or —
 * worse — let them type in somebody else's address and inherit whatever a
 * future email-keyed lookup grants. Changing a sign-in address means proving
 * the new one, which is a verification flow, not a text field.
 */
export async function updateOwnDisplayName(
  userId: number,
  name: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.update(users).set({ name }).where(eq(users.id, userId)),
  );
}

export async function deleteUserById(id: number): Promise<void> {
  await withDbOrThrow((db) => db.delete(users).where(eq(users.id, id)));
}

/**
 * Every users row sharing an email, with the context needed to tell them
 * apart before deleting one (scripts/dedupe-users.ts).
 *
 * `users.email` is deliberately NOT unique — `openId` is. Two rows on one
 * address is therefore a legal state, and often the correct one:
 *   • one row per tenant, for an owner who runs two stores;
 *   • a `pending:<token>` claim row beside the real account, when a signup
 *     was started and the claim never finished (createPendingTenantAdmin);
 *   • two providers for one person — `google:<sub>` and a magic link — each
 *     minting its own openId, and so its own row.
 * Only the last of those is a duplicate worth deleting, which is why this
 * returns openId/loginMethod/lastSignedIn rather than just the address.
 */
export type DuplicateEmailUser = {
  id: number;
  tenantId: number | null;
  tenantName: string | null;
  email: string | null;
  name: string | null;
  openId: string;
  role: User["role"];
  loginMethod: string | null;
  pendingClaim: boolean;
  createdAt: Date;
  lastSignedIn: Date;
};

export async function getUsersByEmail(
  email: string,
): Promise<DuplicateEmailUser[]> {
  return withDb(async (db) => {
    const rows = await db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        tenantName: tenants.name,
        email: users.email,
        name: users.name,
        openId: users.openId,
        role: users.role,
        loginMethod: users.loginMethod,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .leftJoin(tenants, eq(tenants.id, users.tenantId))
      // Case-insensitive for the same reason as getStoreUserByEmail: providers
      // disagree about case, so `A@b.c` and `a@b.c` are one person here.
      .where(sql`LOWER(${users.email}) = LOWER(${email})`)
      .orderBy(asc(users.id));
    return rows.map((r) => ({
      ...r,
      pendingClaim: r.openId.startsWith("pending:"),
    }));
  }, []);
}

/**
 * Addresses held by more than one users row, most-duplicated first. The
 * survey step — `getUsersByEmail` then shows which row is which.
 */
export async function findDuplicateEmails(): Promise<
  { email: string; count: number }[]
> {
  return withDb(async (db) => {
    const rows = await db
      .select({
        email: sql<string>`LOWER(${users.email})`.as("email"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(users)
      .where(isNotNull(users.email))
      .groupBy(sql`LOWER(${users.email})`)
      .having(sql`COUNT(*) > 1`)
      .orderBy(desc(sql`COUNT(*)`));
    // MySQL returns COUNT(*) as a string over some driver configurations.
    return rows.map((r) => ({ email: r.email, count: Number(r.count) }));
  }, []);
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

// ─── Onboarding derivation ────────────────────────────────────────────────────

/** Persist AI-translated per-locale content for a product. */
export async function updateProductTranslations(
  tenantId: number,
  productId: number,
  translations: Partial<
    Pick<
      Product,
      | "nameEn"
      | "descriptionEn"
      | "nameDe"
      | "descriptionDe"
      | "nameFr"
      | "descriptionFr"
      | "nameIt"
      | "descriptionIt"
    >
  >,
): Promise<void> {
  if (Object.keys(translations).length === 0) return;
  await withDbOrThrow((db) =>
    db
      .update(products)
      .set(translations)
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId))),
  );
}

export async function countTenantProducts(tenantId: number): Promise<number> {
  return withDb(async (db) => {
    const rows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(products)
      .where(eq(products.tenantId, tenantId));
    return Number(rows[0]?.count ?? 0);
  }, 0);
}

/** Has the tenant ever generated an AI photo (any consumption ledger row)? */
export async function hasPhotoConsumption(tenantId: number): Promise<boolean> {
  return withDb(async (db) => {
    const rows = await db
      .select({ id: photoCreditLedger.id })
      .from(photoCreditLedger)
      .where(
        and(
          eq(photoCreditLedger.tenantId, tenantId),
          eq(photoCreditLedger.kind, "consumption"),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }, false);
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
 * on-demand-TLS "ask" endpoint: only domains a Pro tenant actually saved
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

/**
 * The tenant serving a request that arrived on a custom domain (shop.example.com).
 *
 * The counterpart to getTenantBySlug for hostnames that are NOT platform
 * subdomains. Without it the custom-domain feature stopped at the certificate:
 * Caddy would issue TLS for the domain, the request would reach the app, and
 * tenant resolution — which only ever looked up the host's left-most label
 * against `tenants.slug` — would find nothing, or worse, find an unrelated
 * store whose slug happened to match that label (`shop.example.com` served the
 * store with slug "shop").
 *
 * No plan gate here on purpose: /api/domain-ask already refuses certificates
 * for a downgraded tenant, and a live storefront going blank the moment a
 * subscription lapses is a worse failure than serving it until the cert expires.
 */
export async function getTenantByCustomDomain(
  domain: string,
): Promise<Tenant | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select({ tenant: tenants })
      .from(tenantSettings)
      .innerJoin(tenants, eq(tenants.id, tenantSettings.tenantId))
      .where(eq(tenantSettings.publicDomain, domain.toLowerCase()))
      .limit(1);
    return rows[0]?.tenant;
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

// ─── Photo generation ledger (AI usage log) ──────────────────────────────────
// Post-pivot (two-tier pricing), the ledger is a usage log, not a purchasable
// balance: consumption is -1 per image, failed generations are refunded with
// a +1 manual_adjustment. Free-plan usage this month = -SUM(delta) over the
// current calendar month (refunds cancel out); Pro is unmetered and skips
// the allowance check entirely. Append-only: never update or delete rows.

/**
 * Net AI photo generations this calendar month (UTC), refunds netted out.
 * Drives the Free plan's monthly allowance (PLANS[].aiPhotoAllowancePerMonth).
 */
export async function countPhotoGenerationsThisMonth(
  tenantId: number,
): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  return withDb(async (db) => {
    const rows = await db
      .select({
        used: sql<number>`COALESCE(-SUM(${photoCreditLedger.delta}), 0)`,
      })
      .from(photoCreditLedger)
      .where(
        and(
          eq(photoCreditLedger.tenantId, tenantId),
          gte(photoCreditLedger.createdAt, monthStart),
        ),
      );
    return Math.max(0, Number(rows[0]?.used ?? 0));
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
 * Record one AI photo generation against the tenant's monthly allowance.
 * `allowancePerMonth: null` means unmetered (Pro) — the usage is still
 * logged, but never refused. Returns false (and writes nothing) when a
 * metered tenant has exhausted this month's allowance. The check-then-insert
 * is not a serializable transaction; the only consumer is the admin product
 * editor, where two simultaneous generations by the same merchant are
 * unlikely, and the worst case is one extra image granted — a deliberate
 * availability-over-strictness tradeoff for a goodwill-priced feature.
 */
export async function recordPhotoGeneration(
  tenantId: number,
  allowancePerMonth: number | null,
  ref?: string | null,
): Promise<boolean> {
  if (allowancePerMonth !== null) {
    const used = await countPhotoGenerationsThisMonth(tenantId);
    if (used >= allowancePerMonth) return false;
  }
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

// ── Storage quota ────────────────────────────────────────────────────────────
// Backs the "5 GB / 50 GB photo storage" on the plan cards. See the note on
// storageObjects in drizzle/schema.ts for why the ledger lives in MySQL rather
// than being asked of S3.

/** Bytes this tenant currently occupies. 0 when they have stored nothing. */
export async function getTenantStorageBytes(tenantId: number): Promise<number> {
  const rows = await withDbOrThrow((db) =>
    db
      .select({ total: sql<number>`COALESCE(SUM(${storageObjects.bytes}), 0)` })
      .from(storageObjects)
      .where(eq(storageObjects.tenantId, tenantId)),
  );
  // SUM comes back as a string from MySQL for BIGINT accumulators.
  return Number(rows[0]?.total ?? 0);
}

/** Record an object after it has been written to S3. */
export async function recordStorageObject(
  tenantId: number,
  storageKey: string,
  bytes: number,
): Promise<void> {
  await withDbOrThrow((db) =>
    db.insert(storageObjects).values({ tenantId, storageKey, bytes }),
  );
}

/**
 * Forget an object, releasing its quota. Scoped by tenant so one tenant can
 * never free (or observe) another's usage.
 */
export async function forgetStorageObject(
  tenantId: number,
  storageKey: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .delete(storageObjects)
      .where(
        and(
          eq(storageObjects.tenantId, tenantId),
          eq(storageObjects.storageKey, storageKey),
        ),
      ),
  );
}

// ─── Site imports (the paid one-time switch-in) ───────────────────────────────

/**
 * Record a completed preview. The extraction is stored with it so that the
 * merchant pays for the result they were actually shown: re-crawling after
 * payment could return a different shop (a page edited, a product sold out)
 * from the one they agreed to buy.
 */
export async function createSiteImport(entry: {
  tenantId: number;
  sourceUrl: string;
  extraction: unknown;
  productCount: number;
}): Promise<number> {
  return withDbOrThrow(async (db) => {
    const inserted = await db.insert(siteImports).values({
      tenantId: entry.tenantId,
      sourceUrl: entry.sourceUrl,
      extraction: entry.extraction,
      productCount: entry.productCount,
    });
    return (inserted as unknown as { insertId?: number }).insertId ?? 0;
  });
}

/** Read one import, scoped so a tenant can never open another tenant's crawl. */
export async function getSiteImportForTenant(
  tenantId: number,
  id: number,
): Promise<SiteImport | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select()
      .from(siteImports)
      .where(and(eq(siteImports.tenantId, tenantId), eq(siteImports.id, id)))
      .limit(1);
    return rows[0];
  }, undefined);
}

/** The most recent import for this tenant, for the admin page's resume state. */
export async function getLatestSiteImportForTenant(
  tenantId: number,
): Promise<SiteImport | undefined> {
  return withDb(async (db) => {
    const rows = await db
      .select()
      .from(siteImports)
      .where(eq(siteImports.tenantId, tenantId))
      .orderBy(desc(siteImports.id))
      .limit(1);
    return rows[0];
  }, undefined);
}

/** Remember which Checkout Session was opened for this import. */
export async function setSiteImportCheckoutSession(
  tenantId: number,
  id: number,
  stripeSessionId: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(siteImports)
      .set({ stripeSessionId })
      .where(and(eq(siteImports.tenantId, tenantId), eq(siteImports.id, id))),
  );
}

/**
 * Mark an import paid. Returns true only for the call that actually moved the
 * row out of `previewed`.
 *
 * Stripe retries webhooks, and delivers both `checkout.session.completed` and
 * `async_payment_succeeded` for the same purchase. The status transition is
 * the idempotency key: the second delivery matches no rows and reports false,
 * so the caller does not re-run the import and duplicate the whole catalogue.
 */
export async function markSiteImportPaid(entry: {
  id: number;
  tenantId: number;
  amountCents: number | null;
  currency: string | null;
}): Promise<boolean> {
  return withDbOrThrow(async (db) => {
    const result = await db
      .update(siteImports)
      .set({
        status: "paid",
        paidAt: new Date(),
        amountCents: entry.amountCents,
        currency: entry.currency,
      })
      .where(
        and(
          eq(siteImports.id, entry.id),
          eq(siteImports.tenantId, entry.tenantId),
          eq(siteImports.status, "previewed"),
        ),
      );
    const affected = (result as unknown as Array<{ affectedRows?: number }>)[0]
      ?.affectedRows;
    return Boolean(affected);
  });
}

/**
 * Mark an import as landed. Like the payment transition this is guarded by the
 * status it moves from, so two admins hitting "apply" at once produce one
 * import and one refusal rather than two copies of every product.
 */
export async function markSiteImportApplied(
  tenantId: number,
  id: number,
): Promise<boolean> {
  return withDbOrThrow(async (db) => {
    const result = await db
      .update(siteImports)
      .set({ status: "applied", appliedAt: new Date() })
      .where(
        and(
          eq(siteImports.id, id),
          eq(siteImports.tenantId, tenantId),
          eq(siteImports.status, "paid"),
        ),
      );
    const affected = (result as unknown as Array<{ affectedRows?: number }>)[0]
      ?.affectedRows;
    return Boolean(affected);
  });
}

/**
 * Record a failure. Deliberately does not touch a row that already reached
 * `applied` — a merchant who paid and got their shop must not be shown a
 * failure because a later step tripped.
 */
export async function markSiteImportFailed(
  tenantId: number,
  id: number,
  reason: string,
): Promise<void> {
  await withDbOrThrow((db) =>
    db
      .update(siteImports)
      .set({ status: "failed", failureReason: reason.slice(0, 512) })
      .where(
        and(
          eq(siteImports.id, id),
          eq(siteImports.tenantId, tenantId),
          or(
            eq(siteImports.status, "previewed"),
            eq(siteImports.status, "paid"),
          ),
        ),
      ),
  );
}
