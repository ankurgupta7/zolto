import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import type Stripe from "stripe";
import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import {
  getDb,
  markProductsSold,
  getTenantByPosApiKey,
  getTenantCategories,
  getTenantSettings,
  setTenantTerminalLocation,
} from "./db";
import { posOrders, posOrderItems, products } from "../drizzle/schema";
import { getStripe, isStripeConfigured } from "./stripe";
import { insertedId } from "./insertId";
import { escapeHtml, sendTransactionalEmail } from "./_core/email";
import { storagePut } from "./storage";
import { redeemPairingToken } from "./posPairing";
import { createRateLimiter } from "./rateLimit";

/**
 * The single answer every failed pairing gets. One message for unknown, expired,
 * already-spent and server-side failures alike, so the endpoint can't be used to
 * confirm which tokens ever existed.
 */
const PAIRING_FAILED =
  "This pairing link is no longer valid. Generate a new one from Keys & access.";

/**
 * Pairing is unauthenticated by necessity, so the token is the only thing
 * standing between a caller and a store's POS key. A 32-byte token is not
 * guessable, but a per-IP ceiling keeps anyone from trying at volume and keeps
 * the vault decrypt path off a hot loop.
 */
const pairingLimiter = createRateLimiter({
  limit: 20,
  windowMs: 10 * 60 * 1000,
});

/** Test seam — lets a test start from a clean pairing rate-limit window. */
export async function resetPosPairingRateLimits(): Promise<void> {
  await pairingLimiter.reset();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-tenant POS Key Middleware
// ═══════════════════════════════════════════════════════════════════════════════

interface PosContext {
  tenantId: number;
  tenantSlug: string;
  /** The tenant's display name — what the POS app shows as the store name. */
  tenantName: string;
  /** The tenant's own Stripe Connect account their customers pay into (null until connected). */
  stripeConnectedAccountId: string | null;
  /** Provisioned Terminal Location on the Connect account (null until first use). */
  terminalLocationId: string | null;
}

declare global {
  // biome-ignore lint/suspicious/noRedeclare: global module augmentation of the Express namespace, distinct from the imported Express type
  namespace Express {
    interface Request {
      posContext?: PosContext;
    }
  }
}

async function requirePosKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers["x-pos-key"] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: "Unauthorized — POS API key required" });
    return;
  }

  // Look up tenant by POS API key. No env fallback — each tenant has its own key.
  // A missing/unknown key (or an unavailable DB) is an auth failure, not a 503,
  // so a stale terminal gets a clear "invalid key" rather than a retryable error.
  const tenant = await getTenantByPosApiKey(apiKey);
  if (!tenant) {
    res.status(401).json({ error: "Invalid POS API key" });
    return;
  }

  req.posContext = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name ?? tenant.slug,
    stripeConnectedAccountId: tenant.stripeConnectedAccountId ?? null,
    terminalLocationId: tenant.terminalLocationId ?? null,
  };
  next();
}

function getPosTenant(req: Request): PosContext {
  if (!req.posContext) {
    throw new Error("POS context not set — middleware missing?");
  }
  return req.posContext;
}

// Canonical site URL for Stripe redirect-based payment methods (TWINT).
// Now tenant-aware: uses tenant's custom domain or falls back to platform.
function resolveBaseUrl(tenantSlug: string): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === "production"
    ? `https://${tenantSlug}.zolto.ch`
    : "http://localhost:3000";
}

// POS <-> online inventory sync: a piece with a live reservedUntil hold is
// mid-checkout on the storefront (see server/db.ts reserveProducts /
// server/routers/checkout.ts) and must not be sellable at the register until
// that hold clears — otherwise the same one-of-a-kind piece could be sold
// twice.
function isActivelyReserved(p: { reservedUntil?: Date | null }): boolean {
  return p.reservedUntil != null && p.reservedUntil.getTime() > Date.now();
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ResolvedLineItem = {
  productId: number | null;
  name: string | null;
  priceRappen: number;
};

type ResolveSaleResult =
  | {
      ok: true;
      lineItems: ResolvedLineItem[];
      totalRappen: number;
      // Human-readable summary of what was sold, for the Stripe `description`.
      description: string;
    }
  | { ok: false; status: number; error: string };

// A card_present PaymentIntent carries no line items, so without this a POS
// sale shows up in the merchant's Stripe dashboard as an amount and nothing
// else — there is no way to tell which piece was sold. Stripe caps
// `description` at 1000 chars; stay well under it so the dashboard's payment
// list stays readable.
const POS_DESCRIPTION_PREFIX = "POS sale";
const POS_DESCRIPTION_MAX_LENGTH = 500;

// Names of the items in a sale → the one-line description Stripe shows next to
// the payment. Two of the same name collapse into "Name ×2" rather than
// repeating, and a cart too long to name in full gets "+N more" so the
// description stays a summary instead of being cut off mid-word.
export function buildPosSaleDescription(
  itemNames: (string | null | undefined)[],
): string {
  const counts = new Map<string, number>();
  for (const raw of itemNames) {
    const name = (raw ?? "").trim();
    if (name.length === 0) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const parts = Array.from(counts, ([name, qty]) =>
    qty > 1 ? `${name} ×${qty}` : name,
  );
  // Nothing nameable (every product row missing a name) — still say it was a
  // POS sale, which is more than the dashboard shows today.
  if (parts.length === 0) return POS_DESCRIPTION_PREFIX;

  const compose = (shown: string[], omitted: number): string =>
    `${POS_DESCRIPTION_PREFIX}: ${shown.join(", ")}${
      omitted > 0 ? ` +${omitted} more` : ""
    }`;

  const full = compose(parts, 0);
  if (full.length <= POS_DESCRIPTION_MAX_LENGTH) return full;

  const shown: string[] = [];
  for (const part of parts) {
    const candidate = compose(
      [...shown, part],
      parts.length - shown.length - 1,
    );
    if (candidate.length > POS_DESCRIPTION_MAX_LENGTH) break;
    shown.push(part);
  }
  // A single name longer than the whole budget: hard-truncate it so the
  // description is still valid rather than dropping the item list entirely.
  if (shown.length === 0) {
    const room =
      POS_DESCRIPTION_MAX_LENGTH - compose(["…"], parts.length - 1).length;
    shown.push(`${parts[0].slice(0, Math.max(room, 0))}…`);
  }
  return compose(shown, parts.length - shown.length);
}

// Shared by every "build a sale" endpoint so bargained price overrides,
// custom items, and hidden/sold/stale-cart guards behave identically.
async function resolveSaleLineItems(
  db: Db,
  tenantId: number,
  params: {
    productIds?: number[];
    allowHidden?: boolean;
    priceOverrides?: Record<string, number>;
    customItems?: { name: string; priceRappen: number }[];
  },
): Promise<ResolveSaleResult> {
  const ids = Array.isArray(params.productIds) ? params.productIds : [];
  const custom = Array.isArray(params.customItems) ? params.customItems : [];

  if (ids.length === 0 && custom.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "productIds or customItems required",
    };
  }

  for (const item of custom) {
    if (
      !item ||
      typeof item.name !== "string" ||
      item.name.trim().length === 0 ||
      item.name.length > 255 ||
      !Number.isInteger(item.priceRappen) ||
      item.priceRappen < 0
    ) {
      return {
        ok: false,
        status: 400,
        error:
          "Invalid customItems entry: name and non-negative integer priceRappen required",
      };
    }
  }

  const overrides = new Map<number, number>();
  if (params.priceOverrides && typeof params.priceOverrides === "object") {
    for (const [key, value] of Object.entries(params.priceOverrides)) {
      const productId = Number(key);
      if (
        !Number.isInteger(productId) ||
        !Number.isInteger(value) ||
        value < 0
      ) {
        return {
          ok: false,
          status: 400,
          error: "Invalid priceOverrides entry",
        };
      }
      overrides.set(productId, value);
    }
  }

  // SCOPE TO TENANT: only fetch products belonging to this tenant
  const rows =
    ids.length > 0
      ? await db
          .select()
          .from(products)
          .where(
            and(eq(products.tenantId, tenantId), inArray(products.id, ids)),
          )
      : [];

  const available = rows.filter(
    (p) =>
      (params.allowHidden === true || p.visible) &&
      !p.sold &&
      p.quantity > 0 &&
      !isActivelyReserved(p),
  );
  if (available.length !== ids.length) {
    return {
      ok: false,
      status: 409,
      error:
        "One or more items are no longer available. Refresh the catalogue and rebuild the cart.",
    };
  }

  const productLineItems: ResolvedLineItem[] = available.map((p) => ({
    productId: p.id,
    name: null,
    priceRappen: overrides.has(p.id)
      ? overrides.get(p.id)!
      : Math.round(Number(p.price) * 100),
  }));
  const customLineItems: ResolvedLineItem[] = custom.map((item) => ({
    productId: null,
    name: item.name.trim(),
    priceRappen: item.priceRappen,
  }));
  const lineItems = [...productLineItems, ...customLineItems];

  const totalRappen = lineItems.reduce((sum, i) => sum + i.priceRappen, 0);
  if (totalRappen <= 0) {
    return {
      ok: false,
      status: 422,
      error: "Computed total is CHF 0.00 — refusing to create a charge",
    };
  }

  // Catalogue line items deliberately store `name: null` (the name is joined
  // from products at read time), so the description is built from the product
  // rows here rather than from lineItems.
  const description = buildPosSaleDescription([
    ...available.map((p) => p.name),
    ...customLineItems.map((i) => i.name),
  ]);

  return { ok: true, lineItems, totalRappen, description };
}

// Persists the pos_order + line items, scoped to tenant
/**
 * Line items for POS orders with a DISPLAYABLE name on every row.
 *
 * `pos_order_items.name` is only filled in for custom (off-catalogue) items —
 * a catalogue sale stores the product id and leaves the name null, because the
 * product row already has it. Every reader that skipped the join therefore
 * showed "Item" (or nothing) where the piece's name belonged: the POS app's
 * sales history, and the receipt emailed to the customer. Resolve it once,
 * here, so no caller has to remember. Order is stable (by item id) so a
 * receipt and a history row list the same sale the same way.
 */
async function loadPosOrderItems(
  db: Db,
  tenantId: number,
  posOrderIds: number[],
): Promise<
  Array<{
    posOrderId: number;
    productId: number | null;
    name: string;
    priceRappen: number;
  }>
> {
  if (posOrderIds.length === 0) return [];
  const rows = await db
    .select({
      posOrderId: posOrderItems.posOrderId,
      productId: posOrderItems.productId,
      customName: posOrderItems.name,
      productName: products.name,
      priceRappen: posOrderItems.priceRappen,
    })
    .from(posOrderItems)
    .leftJoin(products, eq(posOrderItems.productId, products.id))
    .where(
      and(
        eq(posOrderItems.tenantId, tenantId),
        inArray(posOrderItems.posOrderId, posOrderIds),
      ),
    )
    .orderBy(posOrderItems.id);
  return rows.map((r) => ({
    posOrderId: r.posOrderId,
    productId: r.productId,
    // A deleted product leaves the join empty, so the last resort still has to
    // be a placeholder — but it is now a genuine last resort, not the norm.
    name: r.productName ?? r.customName ?? "Item",
    priceRappen: r.priceRappen,
  }));
}

async function createPosOrder(
  db: Db,
  tenantId: number,
  params: {
    stripePaymentIntentId: string | null;
    status: "pending" | "paid";
    paymentMethod: "card" | "cash" | "twint" | "twint_qr";
    totalRappen: number;
    lineItems: ResolvedLineItem[];
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  },
): Promise<number> {
  const inserted = await db.insert(posOrders).values({
    tenantId,
    stripePaymentIntentId: params.stripePaymentIntentId,
    status: params.status,
    paymentMethod: params.paymentMethod,
    totalRappen: params.totalRappen,
    customerName: params.customerName || null,
    customerEmail: params.customerEmail || null,
    customerPhone: params.customerPhone || null,
  });

  const posOrderId = insertedId(inserted);
  // Reading this id wrong is what emptied the sales history: the guard below
  // used to be `if (posOrderId > 0)`, and `posOrderId` was always 0, so no
  // sale ever got an invoice number OR a single line item. See insertedId().
  // Failing loudly beats recording a sale nothing can be attached to.
  if (posOrderId === 0) {
    throw new Error("pos_orders insert returned no id");
  }

  {
    await db
      .update(posOrders)
      .set({ invoiceNumber: `KPOS-${posOrderId}` })
      .where(eq(posOrders.id, posOrderId));

    await db.insert(posOrderItems).values(
      params.lineItems.map((item) => ({
        tenantId,
        posOrderId,
        productId: item.productId,
        name: item.name,
        priceRappen: item.priceRappen,
      })),
    );
  }

  return posOrderId;
}

async function fulfillPosOrder(
  db: Db,
  intent: Stripe.PaymentIntent,
): Promise<{ posOrderId: number; alreadyFulfilled: boolean } | null> {
  const rows = await db
    .select()
    .from(posOrders)
    .where(eq(posOrders.stripePaymentIntentId, intent.id))
    .limit(1);

  const order = rows[0];
  if (!order) {
    console.warn(`[POS] No pos_order found for intent ${intent.id}`);
    return null;
  }
  if (order.status === "paid")
    return { posOrderId: order.id, alreadyFulfilled: true };

  const items = await db
    .select()
    .from(posOrderItems)
    .where(eq(posOrderItems.posOrderId, order.id));

  const productIds = items
    .map((i) => i.productId)
    .filter((id): id is number => id !== null);

  await db
    .update(posOrders)
    .set({ status: "paid" })
    .where(eq(posOrders.id, order.id));

  await markProductsSold(order.tenantId, productIds);

  return { posOrderId: order.id, alreadyFulfilled: false };
}

export function registerPosWebhook(app: Express): void {
  app.post(
    "/api/pos/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const stripe = getStripe();
      const webhookSecret = process.env.STRIPE_POS_WEBHOOK_SECRET;
      if (!stripe || !webhookSecret) {
        console.warn("[POS] Webhook received but POS Stripe is not configured");
        res.status(400).send("POS Stripe not configured");
        return;
      }

      const signature = req.headers["stripe-signature"];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          signature as string,
          webhookSecret,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[POS] Webhook signature verification failed:", msg);
        res.status(400).send(`Webhook Error: ${msg}`);
        return;
      }

      try {
        if (event.type === "payment_intent.succeeded") {
          const db = await getDb();
          if (db) {
            await fulfillPosOrder(
              db,
              event.data.object as Stripe.PaymentIntent,
            );
          }
        }
      } catch (err) {
        console.error(`[POS] Error handling ${event.type}:`, err);
        res.status(500).send("Webhook handler failed");
        return;
      }

      res.json({ received: true });
    },
  );
}

// ---------------------------------------------------------------------------
// Receipt HTML generator
// ---------------------------------------------------------------------------

interface ReceiptItem {
  productName: string;
  priceRappen: number;
}

interface ReceiptOrder {
  id: number;
  invoiceNumber: string | null;
  paymentMethod: string;
  totalRappen: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: Date;
  items: ReceiptItem[];
}

function _generateReceiptHtml(
  order: ReceiptOrder,
  tenantName: string = "Zolto Store",
  tenantDomain: string = "",
  returnsFooter: string = "14-day returns on unused items in original condition",
): string {
  const orderRef = String(order.id).padStart(5, "0");
  const date = new Date(order.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const totalChf = (order.totalRappen / 100).toFixed(2);

  const itemRowsHtml = order.items
    .map((item) => {
      const name = escapeHtml(item.productName ?? "Custom item");
      const price = (item.priceRappen / 100).toFixed(2);
      return `
      <tr style="border-bottom:1px solid #F0EAE0">
        <td style="padding:10px 0;font-family:Georgia,serif;font-size:14px;color:#2D2620">${name}</td>
        <td style="padding:10px 0;text-align:right;font-family:Arial,sans-serif;font-size:14px;color:#2D2620;white-space:nowrap">CHF ${price}</td>
      </tr>`;
    })
    .join("");

  const billedTo =
    order.customerName || order.customerEmail
      ? `<div style="margin-bottom:24px">
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#6B5E52">Billed to</p>
        ${order.customerName ? `<p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#2D2620">${escapeHtml(order.customerName)}</p>` : ""}
        ${order.customerEmail ? `<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#6B5E52">${escapeHtml(order.customerEmail)}</p>` : ""}
        ${order.customerPhone ? `<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#6B5E52">${escapeHtml(order.customerPhone)}</p>` : ""}
       </div>`
      : "";

  const paymentRow = order.paymentMethod
    ? `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #E0D8CC;font-family:Arial,sans-serif;font-size:12px;color:#6B5E52">
         Payment: <span style="text-transform:uppercase">${escapeHtml(order.paymentMethod)}</span>
       </p>`
    : "";

  const invoiceNumber = order.invoiceNumber ?? `KPOS-${order.id}`;
  const footerDomain = tenantDomain || `${tenantName.toLowerCase()}.zolto.ch`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt #${orderRef}</title>
<style>
  @media print {
    body * { visibility: hidden !important; }
    #receipt, #receipt * { visibility: visible !important; }
    #receipt { position: fixed !important; inset: 0 !important; width: 100% !important; max-width: 100% !important; padding: 48px !important; box-sizing: border-box !important; border: none !important; }
    .no-print { display: none !important; }
  }
  body { margin: 0; padding: 20px; background: #FAF8F5; font-family: Arial, sans-serif; }
</style></head><body>
  <div class="no-print" style="max-width: 600px; margin: 0 auto 20px; text-align: right">
    <button onclick="window.print()" style="background: #2D2620; color: #B8963E; border: none; padding: 10px 24px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer">Print Receipt</button>
  </div>
  <div id="receipt" style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #E0D8CC">
    <div style="background: #2D2620; padding: 32px; text-align: center">
      <p style="margin: 0 0 6px; font-family: Georgia, serif; font-size: 22px; letter-spacing: 0.22em; color: #B8963E; text-transform: uppercase">${escapeHtml(tenantName)}</p>
      <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; color: #8A7865">${escapeHtml(footerDomain)}</p>
    </div>
    <div style="padding: 32px">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #E0D8CC; padding-bottom: 20px; margin-bottom: 24px">
        <div>
          <p style="margin: 0; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #2D2620">Receipt</p>
          <p style="margin: 4px 0 0; font-size: 10px; color: #6B5E52">Invoice: ${invoiceNumber}</p>
        </div>
        <div style="text-align: right">
          <p style="margin: 0; font-size: 13px; color: #2D2620">#${orderRef}</p>
          <p style="margin: 3px 0 0; font-size: 11px; color: #6B5E52">${date}</p>
        </div>
      </div>
      ${billedTo}
      <table style="width: 100%; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 1px solid #E0D8CC">
            <th style="padding-bottom: 8px; text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B5E52; font-weight: normal">Item</th>
            <th style="padding-bottom: 8px; text-align: right; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B5E52; font-weight: normal; white-space: nowrap">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml}
          <tr>
            <td style="padding-top: 14px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #2D2620">Total</td>
            <td style="padding-top: 14px; font-size: 14px; color: #2D2620; text-align: right; font-weight: bold; white-space: nowrap">CHF ${totalChf}</td>
          </tr>
        </tbody>
      </table>
      ${paymentRow}
    </div>
    <div style="border-top: 1px solid #E0D8CC; padding: 14px 32px; text-align: center">
      <p style="margin: 0; font-size: 11px; color: #A09080; line-height: 1.6">${escapeHtml(footerDomain)} · ${escapeHtml(returnsFooter)}</p>
    </div>
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------

export function registerPosRoutes(app: Express): void {
  // ─── One-tap pairing ────────────────────────────────────────────────────────
  // Deliberately NOT behind requirePosKey: this is how a register that has no
  // key yet gets one. The pairing token IS the credential here — single-use and
  // minutes-long (server/posPairing.ts).
  //
  // Every failure answers with the same 400 and the same message. Separating
  // "unknown token" from "expired" from "already used" would let someone
  // grinding tokens learn which guesses were once real, and the app has nothing
  // useful to do with the distinction anyway.
  app.post("/api/pos/pair", async (req: Request, res: Response) => {
    const clientKey =
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ||
      req.ip ||
      "unknown";

    const limit = await pairingLimiter.check(clientKey);
    if (!limit.allowed) {
      res.status(429).json({
        error: "Too many pairing attempts",
        retryAfter: limit.retryAfterSeconds,
      });
      return;
    }

    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string") {
      res.status(400).json({ error: PAIRING_FAILED });
      return;
    }

    try {
      const paired = await redeemPairingToken(token);
      if (!paired) {
        res.status(400).json({ error: PAIRING_FAILED });
        return;
      }
      res.json({
        apiKey: paired.apiKey,
        storeName: paired.storeName,
        storeSlug: paired.storeSlug,
      });
    } catch (err) {
      // Never leak why. A DB or vault error looks the same as a bad token.
      console.error("[POS] pairing redemption failed:", err);
      res.status(400).json({ error: PAIRING_FAILED });
    }
  });

  app.get("/api/pos/health", requirePosKey, (_req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      res.status(503).json({ ok: false, error: "Stripe not configured" });
      return;
    }
    res.json({ ok: true, stripe: true });
  });

  app.get(
    "/api/pos/products",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const db = await getDb();
        if (!db) {
          res.status(503).json({ error: "Database unavailable" });
          return;
        }

        const { tenantId } = getPosTenant(req);
        const includeHidden = req.query.includeHidden === "true";
        // Excludes pieces with a live checkout hold (POS <-> online inventory
        // sync) so the register doesn't even list something mid-online-checkout.
        const notActivelyReserved = or(
          isNull(products.reservedUntil),
          lt(products.reservedUntil, new Date()),
        );
        const rows = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.tenantId, tenantId),
              includeHidden
                ? and(
                    eq(products.sold, false),
                    gt(products.quantity, 0),
                    notActivelyReserved,
                  )
                : and(
                    eq(products.visible, true),
                    eq(products.sold, false),
                    gt(products.quantity, 0),
                    notActivelyReserved,
                  ),
            ),
          );

        res.json(
          rows.map((p) => ({
            ...p,
            priceRappen: Math.round(Number(p.price) * 100),
          })),
        );
      } catch (err) {
        console.error("[POS] GET /api/pos/products error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/pos/categories",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        // Categories are per-tenant now. The payload stays a superset of the
        // old static shape (categories + extraIncludes, plus labels), so a
        // jewellery tenant's Android POS sees exactly what it always did.
        const { tenantId } = getPosTenant(req);
        const rows = await getTenantCategories(tenantId);
        const extraIncludes: Record<string, string[]> = {};
        const labels: Record<string, { en: string; de: string | null }> = {};
        for (const row of rows) {
          if (row.extraIncludes?.length) {
            extraIncludes[row.key] = row.extraIncludes;
          }
          labels[row.key] = { en: row.labelEn, de: row.labelDe };
        }
        res.json({
          categories: rows.map((r) => r.key),
          extraIncludes,
          labels,
        });
      } catch (err) {
        console.error("[POS] GET /api/pos/categories error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/pos/config",
    requirePosKey,
    async (req: Request, res: Response) => {
      const { tenantId, tenantSlug, tenantName, terminalLocationId } =
        getPosTenant(req);
      // The merchant's own TWINT QR sticker, if they've uploaded one. Its
      // presence is what enables the POS's "TWINT (QR)" option — a null here
      // means the app must not offer a rail it can't actually display.
      // Read failures degrade to null rather than failing config: losing the
      // QR option is survivable, a POS that won't start is not.
      const settings = await getTenantSettings(tenantId).catch(() => null);
      res.json({
        // Per-tenant Location on the tenant's Connect account; the legacy env
        // fallback only serves single-tenant self-hosted deployments that never
        // connected an account.
        locationId: terminalLocationId ?? process.env.STRIPE_LOCATION_ID ?? "",
        tenantSlug,
        twintQrUrl: settings?.twintQrUrl ?? null,
        // Store identity for generic POS clients (Zolto POS): the app shows
        // the paired store's own name/logo instead of baking a brand into the
        // build. whiteLabelName is the merchant-facing override; the tenant's
        // platform name is the fallback.
        storeName: settings?.whiteLabelName ?? tenantName,
        logoUrl: settings?.logoUrl ?? null,
        currency: settings?.currency ?? "chf",
      });
    },
  );

  // ─── Sales history + receipts ─────────────────────────────────────────────

  // Recent paid sales with line items, for the POS app's history screen.
  app.get(
    "/api/pos/sales",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const db = await getDb();
        if (!db) {
          res.status(503).json({ error: "Database unavailable" });
          return;
        }
        const { tenantId } = getPosTenant(req);
        const limit = Math.min(
          Math.max(parseInt(req.query.limit as string, 10) || 100, 1),
          500,
        );
        const orders = await db
          .select()
          .from(posOrders)
          .where(
            and(eq(posOrders.tenantId, tenantId), eq(posOrders.status, "paid")),
          )
          .orderBy(desc(posOrders.createdAt))
          .limit(limit);
        const orderIds = orders.map((o) => o.id);
        const items = await loadPosOrderItems(db, tenantId, orderIds);
        res.json(
          orders.map((o) => ({
            id: o.id,
            status: o.status,
            invoiceNumber: o.invoiceNumber ?? `KPOS-${o.id}`,
            totalRappen: o.totalRappen,
            totalChf: (o.totalRappen / 100).toFixed(2),
            paymentMethod: o.paymentMethod,
            createdAt: o.createdAt.toISOString(),
            customerName: o.customerName,
            customerEmail: o.customerEmail,
            customerPhone: o.customerPhone,
            items: items
              .filter((i) => i.posOrderId === o.id)
              .map((i) => ({
                productId: i.productId,
                productName: i.name,
                priceRappen: i.priceRappen,
                priceChf: (i.priceRappen / 100).toFixed(2),
              })),
          })),
        );
      } catch (err) {
        console.error("[POS] GET /api/pos/sales error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Load one of the tenant's own orders (+ items) or 404 — shared by receipts.
  async function loadOwnPosOrder(posOrderId: number, tenantId: number) {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(posOrders)
      .where(
        and(eq(posOrders.id, posOrderId), eq(posOrders.tenantId, tenantId)),
      )
      .limit(1);
    const order = rows[0];
    if (!order) return null;
    const items = await loadPosOrderItems(db, tenantId, [posOrderId]);
    return { db, order, items };
  }

  function buildPosReceiptHtml(opts: {
    tenantSlug: string;
    order: typeof posOrders.$inferSelect;
    items: Array<{ name: string; priceRappen: number }>;
  }): string {
    const { order } = opts;
    const rows = opts.items
      .map(
        (i) => `<tr>
  <td style="padding:4px 8px">${escapeHtml(i.name)}</td>
  <td style="padding:4px 8px;text-align:right">CHF ${(i.priceRappen / 100).toFixed(2)}</td>
</tr>`,
      )
      .join("");
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 4px">${escapeHtml(opts.tenantSlug)}</h2>
<p style="color:#666;margin:0 0 16px">Receipt ${escapeHtml(order.invoiceNumber ?? `#${order.id}`)} · ${order.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
<table style="width:100%;border-collapse:collapse">${rows}</table>
<p style="text-align:right;font-size:18px;font-weight:bold">Total: CHF ${(order.totalRappen / 100).toFixed(2)}</p>
<p style="color:#666;font-size:12px">Paid by ${escapeHtml(order.paymentMethod)} · Thank you!</p>
</body></html>`;
  }

  // Email the receipt to the customer (Resend); records the email on the order.
  app.post(
    "/api/pos/send-receipt",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const { tenantId, tenantSlug } = getPosTenant(req);
        const { posOrderId, email } = (req.body ?? {}) as {
          posOrderId?: number;
          email?: string;
        };
        if (
          !posOrderId ||
          !email ||
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
        ) {
          res
            .status(400)
            .json({ error: "posOrderId and a valid email are required" });
          return;
        }
        const loaded = await loadOwnPosOrder(posOrderId, tenantId);
        if (!loaded) {
          res.status(404).json({ error: "Order not found" });
          return;
        }
        const html = buildPosReceiptHtml({
          tenantSlug,
          order: loaded.order,
          items: loaded.items,
        });
        const sent = await sendTransactionalEmail({
          to: email,
          subject: `Your receipt ${loaded.order.invoiceNumber ?? `#${posOrderId}`}`,
          html,
        });
        await loaded.db
          .update(posOrders)
          .set({ customerEmail: email })
          .where(eq(posOrders.id, posOrderId));
        res.json({ sent });
      } catch (err) {
        console.error("[POS] send-receipt error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Persist the receipt: customer details on the order + HTML archived to
  // object storage (receiptUrl), for the merchant's own records.
  app.post(
    "/api/pos/save-receipt",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const { tenantId, tenantSlug } = getPosTenant(req);
        const { posOrderId, customerEmail, customerPhone } = (req.body ??
          {}) as {
          posOrderId?: number;
          customerEmail?: string | null;
          customerPhone?: string | null;
        };
        if (!posOrderId) {
          res.status(400).json({ error: "posOrderId is required" });
          return;
        }
        const loaded = await loadOwnPosOrder(posOrderId, tenantId);
        if (!loaded) {
          res.status(404).json({ error: "Order not found" });
          return;
        }
        let receiptUrl = loaded.order.receiptUrl;
        try {
          const html = buildPosReceiptHtml({
            tenantSlug,
            order: loaded.order,
            items: loaded.items,
          });
          const put = await storagePut(
            tenantId,
            `receipts/${tenantSlug}/${posOrderId}.html`,
            html,
            "text/html",
          );
          receiptUrl = put.url;
        } catch (storageErr) {
          // Storage is optional — customer details still get saved.
          console.warn("[POS] receipt storage failed:", storageErr);
        }
        await loaded.db
          .update(posOrders)
          .set({
            customerEmail: customerEmail || loaded.order.customerEmail,
            customerPhone: customerPhone || loaded.order.customerPhone,
            receiptUrl,
          })
          .where(eq(posOrders.id, posOrderId));
        res.json({ saved: true, receiptUrl });
      } catch (err) {
        console.error("[POS] save-receipt error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // ─── Tap to Pay (Stripe Terminal) ─────────────────────────────────────────
  // Both endpoints operate on the TENANT'S OWN connected Stripe account, so
  // in-person payments land in the same account as the tenant's online sales.
  // Flow: app fetches a connection token → connects the on-phone reader →
  // asks this server for a PaymentIntent → collects on the reader.

  app.post(
    "/api/pos/terminal/connection-token",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const stripe = getStripe();
        if (!stripe) {
          res.status(503).json({ error: "Stripe not configured" });
          return;
        }
        const { stripeConnectedAccountId } = getPosTenant(req);
        if (!stripeConnectedAccountId) {
          res.status(409).json({
            error:
              "Connect your Stripe account first (Admin → payments) to take card payments.",
          });
          return;
        }
        const token = await stripe.terminal.connectionTokens.create(
          {},
          { stripeAccount: stripeConnectedAccountId },
        );
        res.json({ secret: token.secret });
      } catch (err) {
        console.error("[POS] connection-token error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Returns the tenant's Terminal Location, creating it on their Connect
  // account on first use. Stripe requires an address for a Location, so the
  // app sends the merchant's address the first time (collected once in the
  // POS app); afterwards the stored id is returned as-is.
  app.post(
    "/api/pos/terminal/location",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const stripe = getStripe();
        if (!stripe) {
          res.status(503).json({ error: "Stripe not configured" });
          return;
        }
        const ctx = getPosTenant(req);
        if (!ctx.stripeConnectedAccountId) {
          res.status(409).json({
            error:
              "Connect your Stripe account first (Admin → payments) to take card payments.",
          });
          return;
        }
        if (ctx.terminalLocationId) {
          res.json({ locationId: ctx.terminalLocationId });
          return;
        }

        const body = (req.body ?? {}) as {
          displayName?: string;
          address?: {
            line1?: string;
            city?: string;
            postal_code?: string;
            country?: string;
          };
        };
        const addr = body.address ?? {};
        if (!addr.line1 || !addr.city || !addr.postal_code || !addr.country) {
          res.status(400).json({
            error:
              "First-time setup needs the store address: address.line1, city, postal_code, country (ISO 2-letter).",
          });
          return;
        }

        const location = await stripe.terminal.locations.create(
          {
            display_name: body.displayName || ctx.tenantSlug,
            address: {
              line1: addr.line1,
              city: addr.city,
              postal_code: addr.postal_code,
              country: addr.country,
            },
          },
          { stripeAccount: ctx.stripeConnectedAccountId },
        );
        await setTenantTerminalLocation(ctx.tenantId, location.id);
        res.json({ locationId: location.id });
      } catch (err) {
        console.error("[POS] terminal location error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Card (Terminal / Tap to Pay): create a card_present PaymentIntent and a
  // pending pos_order; the app confirms on the reader, then calls /api/pos/sale.
  app.post(
    "/api/pos/payment-intent",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const stripe = getStripe();
        const db = await getDb();
        if (!stripe) {
          res.status(503).json({ error: "Stripe not configured" });
          return;
        }
        if (!db) {
          res.status(503).json({ error: "Database unavailable" });
          return;
        }

        const { tenantId, stripeConnectedAccountId } = getPosTenant(req);
        const {
          productIds,
          allowHidden,
          priceOverrides,
          customItems,
          customerName,
          customerEmail,
          customerPhone,
        } = req.body as SaleRequestBody;

        const resolved = await resolveSaleLineItems(db, tenantId, {
          productIds,
          allowHidden,
          priceOverrides,
          customItems,
        });
        if (!resolved.ok) {
          res.status(resolved.status).json({ error: resolved.error });
          return;
        }
        const { lineItems, totalRappen, description } = resolved;

        // When the tenant has connected their own Stripe account, card-present
        // intents are created ON that account — Tap to Pay collects with a
        // connection token from the same account, and the money lands with the
        // merchant just like their online sales. Platform-account creation is
        // the fallback for single-tenant self-hosted deployments.
        const stripeOpts = stripeConnectedAccountId
          ? { stripeAccount: stripeConnectedAccountId }
          : undefined;
        const currency = (
          (await getTenantSettings(tenantId))?.currency || "chf"
        ).toLowerCase();

        // Attach a Stripe Customer so in-person sales show up under Customers,
        // not just Payments, in the dashboard.
        const stripeCustomer = await stripe.customers.create(
          {
            name: customerName || undefined,
            email: customerEmail || undefined,
            phone: customerPhone || undefined,
          },
          stripeOpts,
        );

        const intent = await stripe.paymentIntents.create(
          {
            amount: totalRappen,
            currency,
            customer: stripeCustomer.id,
            receipt_email: customerEmail || undefined,
            // Names the items sold, so the merchant's Stripe dashboard shows
            // what the payment was for instead of just an amount.
            description,
            payment_method_types: ["card_present"],
            capture_method: "automatic",
            metadata: {
              tenantId: String(tenantId),
              productIds: (Array.isArray(productIds) ? productIds : []).join(
                ",",
              ),
              hasCustomItems: lineItems.some((i) => i.productId === null)
                ? "true"
                : "false",
            },
          },
          stripeOpts,
        );

        const posOrderId = await createPosOrder(db, tenantId, {
          stripePaymentIntentId: intent.id,
          status: "pending",
          paymentMethod: "card",
          totalRappen,
          lineItems,
          customerName,
          customerEmail,
          customerPhone,
        });

        res.json({
          clientSecret: intent.client_secret,
          paymentIntentId: intent.id,
          posOrderId,
          totalRappen,
        });
      } catch (err) {
        console.error("[POS] POST /api/pos/payment-intent error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // TWINT: create + confirm a `twint` PaymentIntent and hand back the redirect
  // URL Stripe returns (rendered as a QR code by the app). Order stays pending
  // until the webhook or /api/pos/sale confirms it.
  app.post(
    "/api/pos/twint-intent",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const stripe = getStripe();
        const db = await getDb();
        if (!stripe) {
          res.status(503).json({ error: "Stripe not configured" });
          return;
        }
        if (!db) {
          res.status(503).json({ error: "Database unavailable" });
          return;
        }

        const { tenantId, tenantSlug, stripeConnectedAccountId } =
          getPosTenant(req);
        const {
          productIds,
          allowHidden,
          priceOverrides,
          customItems,
          customerName,
          customerEmail,
          customerPhone,
        } = req.body as SaleRequestBody;

        const resolved = await resolveSaleLineItems(db, tenantId, {
          productIds,
          allowHidden,
          priceOverrides,
          customItems,
        });
        if (!resolved.ok) {
          res.status(resolved.status).json({ error: resolved.error });
          return;
        }
        const { lineItems, totalRappen, description } = resolved;

        // Same direct-charge pattern as /api/pos/payment-intent above: when the
        // tenant has connected their own Stripe account, the TWINT intent (and
        // the customer it's attached to) is created ON that account so funds
        // settle with the merchant instead of the platform. Platform-account
        // creation is the fallback for single-tenant self-hosted deployments.
        const stripeOpts = stripeConnectedAccountId
          ? { stripeAccount: stripeConnectedAccountId }
          : undefined;

        const stripeCustomer = await stripe.customers.create(
          {
            name: customerName || undefined,
            email: customerEmail || undefined,
            phone: customerPhone || undefined,
          },
          stripeOpts,
        );

        const intent = await stripe.paymentIntents.create(
          {
            amount: totalRappen,
            currency: "chf",
            customer: stripeCustomer.id,
            receipt_email: customerEmail || undefined,
            // Same reason as the card intent: without it a TWINT sale is an
            // amount with no indication of what was bought.
            description,
            payment_method_types: ["twint"],
            payment_method_data: { type: "twint" },
            confirm: true,
            return_url: `${resolveBaseUrl(tenantSlug)}/pos/twint-return`,
            // Merchant name shown in the TWINT app (22-char max). Stripe also reads
            // the account business-profile name; keep it set per tenant there.
            statement_descriptor: posStatementDescriptor(tenantSlug),
            metadata: {
              tenantId: String(tenantId),
              productIds: (Array.isArray(productIds) ? productIds : []).join(
                ",",
              ),
              hasCustomItems: lineItems.some((i) => i.productId === null)
                ? "true"
                : "false",
            },
          },
          stripeOpts,
        );

        const redirectUrl = intent.next_action?.redirect_to_url?.url;
        if (!redirectUrl) {
          console.error(
            `[POS] TWINT intent ${intent.id} has no redirect_to_url`,
            intent.next_action,
          );
          res
            .status(502)
            .json({ error: "TWINT did not return a redirect URL" });
          return;
        }

        const posOrderId = await createPosOrder(db, tenantId, {
          stripePaymentIntentId: intent.id,
          status: "pending",
          paymentMethod: "twint",
          totalRappen,
          lineItems,
          customerName,
          customerEmail,
          customerPhone,
        });

        res.json({
          redirectUrl,
          paymentIntentId: intent.id,
          posOrderId,
          totalRappen,
        });
      } catch (err) {
        console.error("[POS] POST /api/pos/twint-intent error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Attested sales: no Stripe, no async confirmation. The merchant has already
  // seen the money — counted in hand (`cash`) or landing in their own TWINT app
  // after the customer scanned their QR sticker (`twint_qr`) — so this records
  // the sale and decrements stock immediately.
  app.post(
    "/api/pos/manual-sale",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const db = await getDb();
        if (!db) {
          res.status(503).json({ error: "Database unavailable" });
          return;
        }

        const { tenantId } = getPosTenant(req);
        const {
          productIds,
          allowHidden,
          priceOverrides,
          customItems,
          customerName,
          customerEmail,
          customerPhone,
          paymentMethod,
        } = req.body as SaleRequestBody;

        const method = parseAttestedMethod(paymentMethod);
        if (!method) {
          res.status(400).json({
            error: `paymentMethod must be one of: ${ATTESTED_METHODS.join(", ")}`,
          });
          return;
        }

        const resolved = await resolveSaleLineItems(db, tenantId, {
          productIds,
          allowHidden,
          priceOverrides,
          customItems,
        });
        if (!resolved.ok) {
          res.status(resolved.status).json({ error: resolved.error });
          return;
        }
        const { lineItems, totalRappen } = resolved;

        const posOrderId = await createPosOrder(db, tenantId, {
          stripePaymentIntentId: null,
          status: "paid",
          paymentMethod: method,
          totalRappen,
          lineItems,
          customerName,
          customerEmail,
          customerPhone,
        });

        const productIdsSold = lineItems
          .map((i) => i.productId)
          .filter((id): id is number => id !== null);
        await markProductsSold(tenantId, productIdsSold);

        res.json({ success: true, posOrderId, totalRappen });
      } catch (err) {
        console.error("[POS] POST /api/pos/manual-sale error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Confirm a card/TWINT sale: verify the PaymentIntent succeeded, then fulfil
  // the matching pos_order (mark paid + decrement stock). Idempotent.
  app.post(
    "/api/pos/sale",
    requirePosKey,
    async (req: Request, res: Response) => {
      try {
        const stripe = getStripe();
        if (!stripe) {
          res.status(503).json({ error: "Stripe not configured" });
          return;
        }
        const db = await getDb();
        if (!db) {
          res.status(503).json({ error: "Database unavailable" });
          return;
        }

        const { paymentIntentId } = req.body as { paymentIntentId?: string };
        if (!paymentIntentId) {
          res.status(400).json({ error: "paymentIntentId required" });
          return;
        }

        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== "succeeded") {
          res.status(400).json({
            error: `Payment not succeeded (status: ${intent.status})`,
          });
          return;
        }

        const result = await fulfillPosOrder(db, intent);
        if (!result) {
          res
            .status(404)
            .json({ error: "No matching pos_order for this PaymentIntent" });
          return;
        }

        res.json({
          success: true,
          posOrderId: result.posOrderId,
          alreadyFulfilled: result.alreadyFulfilled,
        });
      } catch (err) {
        console.error("[POS] POST /api/pos/sale error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}

// Shared request shape for the sale-building POS endpoints.
interface SaleRequestBody {
  productIds?: number[];
  allowHidden?: boolean;
  priceOverrides?: Record<string, number>;
  customItems?: { name: string; priceRappen: number }[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /** Only meaningful on /api/pos/manual-sale — see ATTESTED_METHODS. */
  paymentMethod?: string;
}

// Methods recorded on the merchant's word rather than a gateway's confirmation.
// `cash` — the cashier counted it. `twint_qr` — the customer scanned the
// merchant's own TWINT sticker and the merchant watched it land in their TWINT
// app; TWINT exposes no API for us to verify it (see
// docs/planning/native-twint-integration.md §4b). Anything outside this list
// must go through a Stripe-confirmed path instead, so this doubles as the
// allow-list that stops a POS client claiming a `card` sale it never took.
const ATTESTED_METHODS = ["cash", "twint_qr"] as const;
type AttestedMethod = (typeof ATTESTED_METHODS)[number];

function parseAttestedMethod(value: unknown): AttestedMethod | null {
  if (value === undefined || value === null) return "cash"; // back-compat default
  return (ATTESTED_METHODS as readonly string[]).includes(value as string)
    ? (value as AttestedMethod)
    : null;
}

// Stripe statement_descriptor allows letters/numbers/spaces only, 5–22 chars.
// Derive a neutral, tenant-scoped descriptor from the slug; fall back to ZOLTO.
function posStatementDescriptor(tenantSlug: string): string {
  const cleaned = tenantSlug
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, 22);
  return cleaned.length >= 5 ? cleaned : "ZOLTO";
}
