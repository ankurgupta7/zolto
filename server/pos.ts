import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import type Stripe from "stripe";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import {
  getDb,
  getAllProducts,
  updateProduct,
  markProductsSold,
  getTenantByPosApiKey,
} from "./db";
import { posOrders, posOrderItems, products } from "../drizzle/schema";
import { getStripe, isStripeConfigured } from "./stripe";
import { sendOrderReceipt, escapeHtml } from "./_core/email";
import { storagePut } from "./storage";
import { PRODUCT_CATEGORIES, CATEGORY_EXTRA_INCLUDES } from "../shared/const";

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-tenant POS Key Middleware
// ═══════════════════════════════════════════════════════════════════════════════

interface PosContext {
  tenantId: number;
  tenantSlug: string;
}

declare global {
  namespace Express {
    interface Request {
      posContext?: PosContext;
    }
  }
}

async function requirePosKey(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  req.posContext = { tenantId: tenant.id, tenantSlug: tenant.slug };
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

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ResolvedLineItem = {
  productId: number | null;
  name: string | null;
  priceRappen: number;
};

type ResolveSaleResult =
  | { ok: true; lineItems: ResolvedLineItem[]; totalRappen: number }
  | { ok: false; status: number; error: string };

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
  }
): Promise<ResolveSaleResult> {
  const ids = Array.isArray(params.productIds) ? params.productIds : [];
  const custom = Array.isArray(params.customItems) ? params.customItems : [];

  if (ids.length === 0 && custom.length === 0) {
    return { ok: false, status: 400, error: "productIds or customItems required" };
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
        error: "Invalid customItems entry: name and non-negative integer priceRappen required",
      };
    }
  }

  const overrides = new Map<number, number>();
  if (params.priceOverrides && typeof params.priceOverrides === "object") {
    for (const [key, value] of Object.entries(params.priceOverrides)) {
      const productId = Number(key);
      if (!Number.isInteger(productId) || !Number.isInteger(value) || value < 0) {
        return { ok: false, status: 400, error: "Invalid priceOverrides entry" };
      }
      overrides.set(productId, value);
    }
  }

  // SCOPE TO TENANT: only fetch products belonging to this tenant
  const rows = ids.length > 0
    ? await db.select().from(products).where(
        and(
          eq(products.tenantId, tenantId),
          inArray(products.id, ids)
        )
      )
    : [];

  const available = rows.filter(
    p => (params.allowHidden === true || p.visible) && !p.sold && p.quantity > 0
  );
  if (available.length !== ids.length) {
    return {
      ok: false,
      status: 409,
      error: "One or more items are no longer available. Refresh the catalogue and rebuild the cart.",
    };
  }

  const productLineItems: ResolvedLineItem[] = available.map(p => ({
    productId: p.id,
    name: null,
    priceRappen: overrides.has(p.id) ? overrides.get(p.id)! : Math.round(Number(p.price) * 100),
  }));
  const customLineItems: ResolvedLineItem[] = custom.map(item => ({
    productId: null,
    name: item.name.trim(),
    priceRappen: item.priceRappen,
  }));
  const lineItems = [...productLineItems, ...customLineItems];

  const totalRappen = lineItems.reduce((sum, i) => sum + i.priceRappen, 0);
  if (totalRappen <= 0) {
    return { ok: false, status: 422, error: "Computed total is CHF 0.00 — refusing to create a charge" };
  }

  return { ok: true, lineItems, totalRappen };
}

// Persists the pos_order + line items, scoped to tenant
async function createPosOrder(
  db: Db,
  tenantId: number,
  params: {
    stripePaymentIntentId: string | null;
    status: "pending" | "paid";
    paymentMethod: "card" | "cash" | "twint";
    totalRappen: number;
    lineItems: ResolvedLineItem[];
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  }
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

  const posOrderId = (inserted as unknown as { insertId?: number }).insertId ?? 0;

  if (posOrderId > 0) {
    await db
      .update(posOrders)
      .set({ invoiceNumber: `KPOS-${posOrderId}` })
      .where(eq(posOrders.id, posOrderId));

    await db.insert(posOrderItems).values(
      params.lineItems.map(item => ({
        tenantId,
        posOrderId,
        productId: item.productId,
        name: item.name,
        priceRappen: item.priceRappen,
      }))
    );
  }

  return posOrderId;
}

async function fulfillPosOrder(
  db: Db,
  intent: Stripe.PaymentIntent
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
  if (order.status === "paid") return { posOrderId: order.id, alreadyFulfilled: true };

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
          webhookSecret
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
            await fulfillPosOrder(db, event.data.object as Stripe.PaymentIntent);
          }
        }
      } catch (err) {
        console.error(`[POS] Error handling ${event.type}:`, err);
        res.status(500).send("Webhook handler failed");
        return;
      }

      res.json({ received: true });
    }
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

function generateReceiptHtml(order: ReceiptOrder, tenantName: string = "Zolto Store", tenantDomain: string = ""): string {
  const orderRef = String(order.id).padStart(5, "0");
  const date = new Date(order.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const totalChf = (order.totalRappen / 100).toFixed(2);

  const itemRowsHtml = order.items.map(item => {
    const name = escapeHtml(item.productName ?? "Custom item");
    const price = (item.priceRappen / 100).toFixed(2);
    return `
      <tr style="border-bottom:1px solid #F0EAE0">
        <td style="padding:10px 0;font-family:Georgia,serif;font-size:14px;color:#2D2620">${name}</td>
        <td style="padding:10px 0;text-align:right;font-family:Arial,sans-serif;font-size:14px;color:#2D2620;white-space:nowrap">CHF ${price}</td>
      </tr>`;
  }).join("");

  const billedTo = (order.customerName || order.customerEmail)
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
      <p style="margin: 0; font-size: 11px; color: #A09080; line-height: 1.6">${escapeHtml(footerDomain)} · 14-day returns on unworn, undamaged pieces</p>
    </div>
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------

export function registerPosRoutes(app: Express): void {
  app.get("/api/pos/health", requirePosKey, (_req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      res.status(503).json({ ok: false, error: "Stripe not configured" });
      return;
    }
    res.json({ ok: true, stripe: true });
  });

  app.get("/api/pos/products", requirePosKey, async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }

      const { tenantId } = getPosTenant(req);
      const includeHidden = req.query.includeHidden === "true";
      const rows = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            includeHidden
              ? and(eq(products.sold, false), gt(products.quantity, 0))
              : and(
                  eq(products.visible, true),
                  eq(products.sold, false),
                  gt(products.quantity, 0)
                )
          )
        );

      res.json(
        rows.map((p) => ({
          ...p,
          priceRappen: Math.round(Number(p.price) * 100),
        }))
      );
    } catch (err) {
      console.error("[POS] GET /api/pos/products error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/pos/categories", requirePosKey, (_req: Request, res: Response) => {
    res.json({
      categories: PRODUCT_CATEGORIES,
      extraIncludes: CATEGORY_EXTRA_INCLUDES,
    });
  });

  app.get("/api/pos/config", requirePosKey, (req: Request, res: Response) => {
    const { tenantSlug } = getPosTenant(req);
    res.json({
      locationId: process.env.STRIPE_LOCATION_ID ?? "",
      tenantSlug,
    });
  });

  // Card (Terminal / Tap to Pay): create a card_present PaymentIntent and a
  // pending pos_order; the app confirms on the reader, then calls /api/pos/sale.
  app.post("/api/pos/payment-intent", requirePosKey, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      const db = await getDb();
      if (!stripe) { res.status(503).json({ error: "Stripe not configured" }); return; }
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }

      const { tenantId } = getPosTenant(req);
      const { productIds, allowHidden, priceOverrides, customItems, customerName, customerEmail, customerPhone } = req.body as SaleRequestBody;

      const resolved = await resolveSaleLineItems(db, tenantId, { productIds, allowHidden, priceOverrides, customItems });
      if (!resolved.ok) { res.status(resolved.status).json({ error: resolved.error }); return; }
      const { lineItems, totalRappen } = resolved;

      // Attach a Stripe Customer so in-person sales show up under Customers,
      // not just Payments, in the dashboard.
      const stripeCustomer = await stripe.customers.create({
        name: customerName || undefined,
        email: customerEmail || undefined,
        phone: customerPhone || undefined,
      });

      const intent = await stripe.paymentIntents.create({
        amount: totalRappen,
        currency: "chf",
        customer: stripeCustomer.id,
        receipt_email: customerEmail || undefined,
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: {
          tenantId: String(tenantId),
          productIds: (Array.isArray(productIds) ? productIds : []).join(","),
          hasCustomItems: lineItems.some(i => i.productId === null) ? "true" : "false",
        },
      });

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

      res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, posOrderId, totalRappen });
    } catch (err) {
      console.error("[POS] POST /api/pos/payment-intent error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // TWINT: create + confirm a `twint` PaymentIntent and hand back the redirect
  // URL Stripe returns (rendered as a QR code by the app). Order stays pending
  // until the webhook or /api/pos/sale confirms it.
  app.post("/api/pos/twint-intent", requirePosKey, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      const db = await getDb();
      if (!stripe) { res.status(503).json({ error: "Stripe not configured" }); return; }
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }

      const { tenantId, tenantSlug } = getPosTenant(req);
      const { productIds, allowHidden, priceOverrides, customItems, customerName, customerEmail, customerPhone } = req.body as SaleRequestBody;

      const resolved = await resolveSaleLineItems(db, tenantId, { productIds, allowHidden, priceOverrides, customItems });
      if (!resolved.ok) { res.status(resolved.status).json({ error: resolved.error }); return; }
      const { lineItems, totalRappen } = resolved;

      const stripeCustomer = await stripe.customers.create({
        name: customerName || undefined,
        email: customerEmail || undefined,
        phone: customerPhone || undefined,
      });

      const intent = await stripe.paymentIntents.create({
        amount: totalRappen,
        currency: "chf",
        customer: stripeCustomer.id,
        receipt_email: customerEmail || undefined,
        payment_method_types: ["twint"],
        payment_method_data: { type: "twint" },
        confirm: true,
        return_url: `${resolveBaseUrl(tenantSlug)}/pos/twint-return`,
        // Merchant name shown in the TWINT app (22-char max). Stripe also reads
        // the account business-profile name; keep it set per tenant there.
        statement_descriptor: posStatementDescriptor(tenantSlug),
        metadata: {
          tenantId: String(tenantId),
          productIds: (Array.isArray(productIds) ? productIds : []).join(","),
          hasCustomItems: lineItems.some(i => i.productId === null) ? "true" : "false",
        },
      });

      const redirectUrl = intent.next_action?.redirect_to_url?.url;
      if (!redirectUrl) {
        console.error(`[POS] TWINT intent ${intent.id} has no redirect_to_url`, intent.next_action);
        res.status(502).json({ error: "TWINT did not return a redirect URL" });
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

      res.json({ redirectUrl, paymentIntentId: intent.id, posOrderId, totalRappen });
    } catch (err) {
      console.error("[POS] POST /api/pos/twint-intent error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cash never touches Stripe — the cashier takes the money, so this records the
  // sale and decrements stock immediately (no async confirmation to wait for).
  app.post("/api/pos/manual-sale", requirePosKey, async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }

      const { tenantId } = getPosTenant(req);
      const { productIds, allowHidden, priceOverrides, customItems, customerName, customerEmail, customerPhone } = req.body as SaleRequestBody;

      const resolved = await resolveSaleLineItems(db, tenantId, { productIds, allowHidden, priceOverrides, customItems });
      if (!resolved.ok) { res.status(resolved.status).json({ error: resolved.error }); return; }
      const { lineItems, totalRappen } = resolved;

      const posOrderId = await createPosOrder(db, tenantId, {
        stripePaymentIntentId: null,
        status: "paid",
        paymentMethod: "cash",
        totalRappen,
        lineItems,
        customerName,
        customerEmail,
        customerPhone,
      });

      const productIdsSold = lineItems
        .map(i => i.productId)
        .filter((id): id is number => id !== null);
      await markProductsSold(tenantId, productIdsSold);

      res.json({ success: true, posOrderId, totalRappen });
    } catch (err) {
      console.error("[POS] POST /api/pos/manual-sale error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Confirm a card/TWINT sale: verify the PaymentIntent succeeded, then fulfil
  // the matching pos_order (mark paid + decrement stock). Idempotent.
  app.post("/api/pos/sale", requirePosKey, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) { res.status(503).json({ error: "Stripe not configured" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }

      const { paymentIntentId } = req.body as { paymentIntentId?: string };
      if (!paymentIntentId) { res.status(400).json({ error: "paymentIntentId required" }); return; }

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        res.status(400).json({ error: `Payment not succeeded (status: ${intent.status})` });
        return;
      }

      const result = await fulfillPosOrder(db, intent);
      if (!result) { res.status(404).json({ error: "No matching pos_order for this PaymentIntent" }); return; }

      res.json({ success: true, posOrderId: result.posOrderId, alreadyFulfilled: result.alreadyFulfilled });
    } catch (err) {
      console.error("[POS] POST /api/pos/sale error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
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
}

// Stripe statement_descriptor allows letters/numbers/spaces only, 5–22 chars.
// Derive a neutral, tenant-scoped descriptor from the slug; fall back to ZOLTO.
function posStatementDescriptor(tenantSlug: string): string {
  const cleaned = tenantSlug.replace(/[^A-Za-z0-9 ]/g, "").toUpperCase().slice(0, 22);
  return cleaned.length >= 5 ? cleaned : "ZOLTO";
}
