export interface TenantBranding {
  tenantName: string;
  tenantDomain: string;
  contactEmail?: string;
}

const DEFAULT_BRANDING: TenantBranding = {
  tenantName: "Zolto Store",
  tenantDomain:
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://zolto.ch",
  contactEmail: process.env.RESEND_FROM_EMAIL ?? "orders@zolto.ch",
};

function resolveBranding(override?: Partial<TenantBranding>): TenantBranding {
  return {
    tenantName: override?.tenantName ?? DEFAULT_BRANDING.tenantName,
    tenantDomain: override?.tenantDomain ?? DEFAULT_BRANDING.tenantDomain,
    contactEmail: override?.contactEmail ?? DEFAULT_BRANDING.contactEmail,
  };
}
// Several fields interpolated into the receipt HTML below (customer name,
// email, product labels, payment method) originate from Stripe Checkout
// session data, which the payer controls. Escape them to prevent HTML/markup
// injection into the email body.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Brand colours ────────────────────────────────────────────────────────────
const C = {
  brown: "#2D2620",
  gold: "#B8963E",
  mid: "#6B5E52",
  light: "#8A7865",
  divider: "#E0D8CC",
  faint: "#F0EAE0",
};

// ── Shared receipt data ───────────────────────────────────────────────────────
export interface ReceiptItem {
  id: number;
  name: string;
  nameEn: string | null;
  price: string;
  imageUrl: string | null;
}

export interface OrderReceiptOptions {
  to: string;
  customerName: string | null;
  orderRef: number;
  createdAt?: string | Date;
  items: ReceiptItem[];
  /** Total charged in smallest unit (Rappen for CHF) */
  amountTotal: number;
  paymentMethod?: string | null;
  branding?: Partial<TenantBranding>;
}

// ── HTML receipt (email body) ─────────────────────────────────────────────────
export function buildReceiptHtml(opts: OrderReceiptOptions): string {
  const branding = resolveBranding(opts.branding);
  const baseUrl = branding.tenantDomain;
  const ref = String(opts.orderRef).padStart(5, "0");
  const date = new Date(opts.createdAt ?? Date.now()).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );

  const subtotalRappen = opts.items.reduce(
    (s, p) => s + Math.round(parseFloat(p.price) * 100),
    0,
  );
  const shippingRappen = opts.amountTotal - subtotalRappen;

  const resolveUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith("http") ? url : `${baseUrl}${url}`;
  };

  const itemRows = opts.items
    .map((p) => {
      const productUrl = `${baseUrl}/product/${p.id}`;
      const imgSrc = resolveUrl(p.imageUrl);
      const label = escapeHtml(p.nameEn ?? p.name);

      const thumbCell = imgSrc
        ? `<td style="padding:10px 14px 10px 0;width:60px;vertical-align:middle">
            <a href="${productUrl}" style="display:block">
              <img src="${imgSrc}" width="56" height="56" alt="${label}"
                   style="display:block;width:56px;height:56px;object-fit:cover;border:1px solid ${C.faint}">
            </a>
          </td>`
        : `<td style="width:0;padding:0"></td>`;

      return `
      <tr>
        ${thumbCell}
        <td style="padding:10px 0;border-bottom:1px solid ${C.faint};vertical-align:middle">
          <a href="${productUrl}" style="font-family:Georgia,serif;font-size:14px;color:${C.brown};text-decoration:none">${label}</a>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${C.faint};font-family:Arial,sans-serif;font-size:14px;color:${C.brown};text-align:right;vertical-align:middle;white-space:nowrap">CHF ${Number(p.price).toFixed(2)}</td>
      </tr>`;
    })
    .join("");

  const shippingRow =
    shippingRappen > 0
      ? `<tr>
          <td style="width:0;padding:0"></td>
          <td style="padding:9px 0;border-bottom:1px solid ${C.faint};font-family:Arial,sans-serif;font-size:14px;color:${C.mid}">Shipping</td>
          <td style="padding:9px 0;border-bottom:1px solid ${C.faint};font-family:Arial,sans-serif;font-size:14px;color:${C.mid};text-align:right;white-space:nowrap">CHF ${(shippingRappen / 100).toFixed(2)}</td>
        </tr>`
      : "";

  const paymentRow = opts.paymentMethod
    ? `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${C.divider};font-family:Arial,sans-serif;font-size:12px;color:${C.mid}">
        Payment: <span style="text-transform:uppercase">${escapeHtml(opts.paymentMethod)}</span>
      </p>`
    : "";

  const billedTo = opts.customerName
    ? `<div style="margin-bottom:24px">
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${C.mid}">Billed to</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:14px;color:${C.brown}">${escapeHtml(opts.customerName)}</p>
        <p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:12px;color:${C.mid}">${escapeHtml(opts.to)}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border:1px solid ${C.divider}">

    <!-- Letterhead -->
    <div style="background:${C.brown};padding:32px;text-align:center">
      <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;letter-spacing:0.22em;color:${C.gold};text-transform:uppercase">${escapeHtml(branding.tenantName)}</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.08em;color:${C.light}">Handcrafted with care · ${escapeHtml(branding.tenantDomain.replace(/^https?:\/\//, ""))}</p>
    </div>

    <div style="padding:32px">

      <!-- Receipt header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid ${C.divider};padding-bottom:20px;margin-bottom:24px">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:${C.brown}">Receipt</p>
        <div style="text-align:right">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:${C.brown}">#${ref}</p>
          <p style="margin:3px 0 0;font-family:Arial,sans-serif;font-size:11px;color:${C.mid}">${date}</p>
        </div>
      </div>

      ${billedTo}

      <!-- Items -->
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="width:0;padding:0"></th>
            <th style="padding-bottom:8px;text-align:left;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${C.mid};font-weight:normal;border-bottom:1px solid ${C.divider}">Item</th>
            <th style="padding-bottom:8px;text-align:right;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${C.mid};font-weight:normal;border-bottom:1px solid ${C.divider}">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${shippingRow}
          <tr>
            <td style="width:0;padding:0"></td>
            <td style="padding-top:14px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${C.brown}">Total</td>
            <td style="padding-top:14px;font-family:Arial,sans-serif;font-size:14px;color:${C.brown};text-align:right;font-weight:bold;white-space:nowrap">CHF ${(opts.amountTotal / 100).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      ${paymentRow}

    </div>

    <!-- Footer -->
    <div style="border-top:1px solid ${C.divider};padding:14px 32px;text-align:center">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#A09080;line-height:1.6">
        ${escapeHtml(branding.contactEmail ?? `support@${branding.tenantDomain.replace(/^https?:\/\//, "")}`)} · 14-day returns on unworn, undamaged pieces
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ── Generic transactional email ───────────────────────────────────────────────
// Minimal Resend wrapper for internal/team mail (staff invites etc.) where the
// full order-receipt template doesn't apply. Returns false when Resend isn't
// configured so callers can degrade gracefully (e.g. show the link on screen).

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from ?? "Zolto <noreply@zolto.ch>",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function sendOrderReceipt(
  opts: OrderReceiptOptions,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const branding = resolveBranding(opts.branding);
  const from =
    branding.contactEmail ??
    `orders@${branding.tenantDomain.replace(/^https?:\/\//, "")}`;
  const ref = String(opts.orderRef).padStart(5, "0");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: `Your ${branding.tenantName} order #${ref}`,
      html: buildReceiptHtml(opts),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}

// ── Owner order notification ─────────────────────────────────────────────────
// Task 8 (docs/planning/phase1/tracker.md "Set up order notifications"): an
// internal, unbranded alert to the store's own owner/admin when a piece
// sells online — separate from buildReceiptHtml above, which is the
// customer-facing purchase confirmation.

export interface OwnerOrderNotificationItem {
  name: string;
  nameEn: string | null;
  price: string;
}

export interface OwnerOrderNotificationOptions {
  to: string;
  ownerName: string | null;
  orderRef: number;
  amountTotal: number;
  customerName: string | null;
  customerEmail: string | null;
  paymentMethod: string | null;
  items: OwnerOrderNotificationItem[];
  branding?: Partial<TenantBranding>;
}

export function buildOwnerOrderNotificationHtml(
  opts: OwnerOrderNotificationOptions,
): string {
  const branding = resolveBranding(opts.branding);
  const ref = String(opts.orderRef).padStart(5, "0");
  const greeting = opts.ownerName ? escapeHtml(opts.ownerName) : "there";

  const itemRows = opts.items
    .map(
      (item) =>
        `<li style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:${C.brown}">${escapeHtml(item.nameEn ?? item.name)} — CHF ${Number(item.price).toFixed(2)}</li>`,
    )
    .join("");

  const customerLine =
    opts.customerName || opts.customerEmail
      ? `<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:${C.mid}">Customer: ${escapeHtml(opts.customerName ?? "—")} (${escapeHtml(opts.customerEmail ?? "—")})</p>`
      : "";

  const paymentLine = opts.paymentMethod
    ? `<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:${C.mid}">Payment: ${escapeHtml(opts.paymentMethod)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border:1px solid ${C.divider};padding:32px">
    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:${C.brown}">Hi ${greeting},</p>
    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:${C.brown}">
      New order <strong>#${ref}</strong> just came in on ${escapeHtml(branding.tenantName)} — <strong>CHF ${(opts.amountTotal / 100).toFixed(2)}</strong>.
    </p>
    <ul style="margin:0 0 16px;padding-left:18px">${itemRows}</ul>
    ${customerLine}
    ${paymentLine}
  </div>
</body>
</html>`;
}

export async function sendOwnerOrderEmail(
  opts: OwnerOrderNotificationOptions,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !opts.to) return;

  const branding = resolveBranding(opts.branding);
  const from =
    branding.contactEmail ??
    `orders@${branding.tenantDomain.replace(/^https?:\/\//, "")}`;
  const ref = String(opts.orderRef).padStart(5, "0");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: `New order #${ref} — CHF ${(opts.amountTotal / 100).toFixed(2)}`,
      html: buildOwnerOrderNotificationHtml(opts),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}

// ── Stripe reconciliation review email ──────────────────────────────────────
export interface ReconciliationCandidate {
  id: number;
  name: string;
  nameEn: string | null;
  price: string;
}

export interface ReconciliationReviewItem {
  paymentIntentId: string;
  /** Amount charged, in the smallest currency unit (Rappen for CHF). */
  amountRappen: number;
  currency: string;
  stripeCreatedAt: Date;
  /** Ranked best-guess products, closest price match first. */
  candidates: ReconciliationCandidate[];
  /** Single-use secret embedded in this item's confirm links. */
  token: string;
}

export function buildReconciliationReviewHtml(
  items: ReconciliationReviewItem[],
  branding?: Partial<TenantBranding>,
): string {
  const b = resolveBranding(branding);
  const baseUrl = b.tenantDomain;

  const sections = items
    .map((item) => {
      const amount = (item.amountRappen / 100).toFixed(2);
      const date = item.stripeCreatedAt.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const candidateRows = item.candidates
        .map((c, index) => {
          const label = escapeHtml(c.nameEn ?? c.name);
          const url = `${baseUrl}/api/reconciliation/confirm?token=${encodeURIComponent(item.token)}&choice=${index}`;
          return `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid ${C.faint};font-family:Arial,sans-serif;font-size:13px;color:${C.brown}">${label} — CHF ${Number(c.price).toFixed(2)}</td>
            <td style="padding:8px 0;border-bottom:1px solid ${C.faint};text-align:right;white-space:nowrap">
              <a href="${url}" style="display:inline-block;background:${C.gold};color:${C.brown};text-decoration:none;padding:6px 14px;font-family:Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Assign</a>
            </td>
          </tr>`;
        })
        .join("");

      const noneUrl = `${baseUrl}/api/reconciliation/confirm?token=${encodeURIComponent(item.token)}&choice=none`;

      return `
      <div style="margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid ${C.divider}">
        <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:${C.brown}">
          <strong>CHF ${amount}</strong> · ${date}
        </p>
        <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;color:${C.mid}">
          Stripe payment ${escapeHtml(item.paymentIntentId)} has no matching order or POS sale.
        </p>
        <table style="width:100%;border-collapse:collapse">${candidateRows}</table>
        <p style="margin:12px 0 0">
          <a href="${noneUrl}" style="font-family:Arial,sans-serif;font-size:12px;color:${C.mid}">None of these — mark for manual review</a>
        </p>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border:1px solid ${C.divider}">

    <div style="background:${C.brown};padding:32px;text-align:center">
      <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;letter-spacing:0.22em;color:${C.gold};text-transform:uppercase">${escapeHtml(b.tenantName)}</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.08em;color:${C.light}">Stripe payments needing a match</p>
    </div>

    <div style="padding:32px">
      <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:13px;color:${C.mid}">
        ${items.length} Stripe payment${items.length === 1 ? "" : "s"} ${items.length === 1 ? "was" : "were"} found with no matching order. Pick the piece each one paid for, or mark it for manual review.
      </p>
      ${sections}
    </div>

  </div>
</body>
</html>`;
}

export async function sendReconciliationReviewEmail(
  items: ReconciliationReviewItem[],
  branding?: Partial<TenantBranding>,
): Promise<void> {
  if (items.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL;
  if (!apiKey || !to) return;

  const b = resolveBranding(branding);
  const from =
    b.contactEmail ?? `orders@${b.tenantDomain.replace(/^https?:\/\//, "")}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `${items.length} Stripe payment${items.length === 1 ? "" : "s"} need a match — ${b.tenantName}`,
      html: buildReconciliationReviewHtml(items, branding),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}

// ── POS attribution review email ───────────────────────────────────────────────
// Sibling of the Stripe reconciliation email, for amount-only in-person sales that
// need matching to a product. Same look and one-click confirm pattern, but the
// links point at /api/pos-attribution/confirm and the copy is framed around a sale
// that already happened at the stall rather than an unmatched online payment.

export interface PosAttributionReviewItem {
  /** The pos_order_item row being attributed. */
  posOrderItemId: number;
  /** Line amount, in the smallest currency unit (Rappen for CHF). */
  amountRappen: number;
  soldAt: Date;
  /** The custom label the merchant typed at the till, if any. */
  itemLabel: string | null;
  /** Ranked best-guess products, closest price match first. */
  candidates: ReconciliationCandidate[];
  /** Single-use secret embedded in this item's confirm links. */
  token: string;
}

export function buildPosAttributionReviewHtml(
  items: PosAttributionReviewItem[],
  branding?: Partial<TenantBranding>,
): string {
  const b = resolveBranding(branding);
  const baseUrl = b.tenantDomain;

  const sections = items
    .map((item) => {
      const amount = (item.amountRappen / 100).toFixed(2);
      const date = item.soldAt.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const candidateRows = item.candidates
        .map((c, index) => {
          const label = escapeHtml(c.nameEn ?? c.name);
          const url = `${baseUrl}/api/pos-attribution/confirm?token=${encodeURIComponent(item.token)}&choice=${index}`;
          return `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid ${C.faint};font-family:Arial,sans-serif;font-size:13px;color:${C.brown}">${label} — CHF ${Number(c.price).toFixed(2)}</td>
            <td style="padding:8px 0;border-bottom:1px solid ${C.faint};text-align:right;white-space:nowrap">
              <a href="${url}" style="display:inline-block;background:${C.gold};color:${C.brown};text-decoration:none;padding:6px 14px;font-family:Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">That's it</a>
            </td>
          </tr>`;
        })
        .join("");

      const noneUrl = `${baseUrl}/api/pos-attribution/confirm?token=${encodeURIComponent(item.token)}&choice=none`;
      const labelLine = item.itemLabel
        ? `rung up as “${escapeHtml(item.itemLabel)}”`
        : "rung up as a bare amount";

      return `
      <div style="margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid ${C.divider}">
        <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:${C.brown}">
          <strong>CHF ${amount}</strong> · ${date}
        </p>
        <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;color:${C.mid}">
          In-person sale ${labelLine} — which piece was it?
        </p>
        <table style="width:100%;border-collapse:collapse">${candidateRows}</table>
        <p style="margin:12px 0 0">
          <a href="${noneUrl}" style="font-family:Arial,sans-serif;font-size:12px;color:${C.mid}">None of these — leave it for me to sort out</a>
        </p>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border:1px solid ${C.divider}">

    <div style="background:${C.brown};padding:32px;text-align:center">
      <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;letter-spacing:0.22em;color:${C.gold};text-transform:uppercase">${escapeHtml(b.tenantName)}</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.08em;color:${C.light}">Your day at the stall · confirm what sold</p>
    </div>

    <div style="padding:32px">
      <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:13px;color:${C.mid}">
        ${items.length} in-person sale${items.length === 1 ? "" : "s"} ${items.length === 1 ? "was" : "were"} taken as an amount only. Tap the piece each one was, and we'll mark it sold across your store and POS. Nothing changes until you pick.
      </p>
      ${sections}
    </div>

  </div>
</body>
</html>`;
}

export async function sendPosAttributionReviewEmail(
  items: PosAttributionReviewItem[],
  branding?: Partial<TenantBranding>,
): Promise<void> {
  if (items.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL;
  if (!apiKey || !to) return;

  const b = resolveBranding(branding);
  const from =
    b.contactEmail ?? `orders@${b.tenantDomain.replace(/^https?:\/\//, "")}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `${items.length} in-person sale${items.length === 1 ? "" : "s"} to confirm — ${b.tenantName}`,
      html: buildPosAttributionReviewHtml(items, branding),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}
