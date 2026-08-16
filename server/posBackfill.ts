/**
 * Reconstructing POS line items from Stripe payment descriptions.
 *
 * Every POS sale recorded before the insertId fix (see server/insertId.ts) has
 * an order row and nothing in it: no invoice number, no line items. The order
 * table cannot say what was sold because nothing was ever written.
 *
 * One trace survives. Card and TWINT sales go through Stripe, and
 * `buildPosSaleDescription` has been writing what was in the basket into the
 * PaymentIntent's `description` all along — "POS sale: Pearl Ring, Gift wrap
 * ×2". This reads those back and turns them into the line items that should
 * have been stored.
 *
 * What it deliberately will NOT do is invent a price. The description carries
 * names, not amounts, so a line's price is only written when the order's total
 * can be accounted for exactly:
 *
 *   - one item in the sale  → that item was charged the order total, whatever
 *     the catalogue says today (this is how a bargained sale reconciles), or
 *   - several items whose current list prices sum to exactly the total.
 *
 * Anything else — a bargained multi-item sale, a description truncated by
 * Stripe's length cap, a name no longer in the catalogue — is reported with
 * the names it found and left unwritten, because a wrong number in a money
 * column is worse than an absent one. The report is the deliverable for those.
 *
 * Cash sales never touched Stripe, so they have no description and cannot be
 * reconstructed at all. They are counted so the total is honest about what is
 * unrecoverable.
 *
 * Every read and write here takes an explicit tenantId — one store's repair
 * must never reach into another's orders, and the Stripe reads go to the
 * account that store actually took the payment on.
 */

import type Stripe from "stripe";
import {
  getAllProducts,
  getPaidPosOrdersMissingLineItems,
  getTenantById,
  insertPosOrderItems,
  setPosOrderInvoiceNumber,
} from "./db";
import { getStripe } from "./stripe";

/** Safety cap so one run can't scan an unbounded amount of history. */
export const MAX_ORDERS_SCANNED = 500;

// ─── Parsing ─────────────────────────────────────────────────────────────────

const DESCRIPTION_PREFIX = "POS sale";

export interface ParsedSaleName {
  name: string;
  quantity: number;
}

export interface ParsedDescription {
  names: ParsedSaleName[];
  /** From a trailing "+N more" — items the description had no room to name. */
  omittedCount: number;
  /** A name was hard-truncated ("Verylongna…"), so it can't be matched. */
  truncated: boolean;
}

/**
 * Invert `buildPosSaleDescription`. Returns null for a description this
 * codebase did not write — a merchant's own Stripe dashboard note, say, which
 * must never be mistaken for a record of what was in the basket.
 */
export function parsePosSaleDescription(
  description: string | null | undefined,
): ParsedDescription | null {
  if (typeof description !== "string") return null;
  const trimmed = description.trim();
  if (trimmed === DESCRIPTION_PREFIX) {
    // A sale whose every product row had a blank name. Ours, but empty.
    return { names: [], omittedCount: 0, truncated: false };
  }
  if (!trimmed.startsWith(`${DESCRIPTION_PREFIX}: `)) return null;

  let body = trimmed.slice(DESCRIPTION_PREFIX.length + 2);

  let omittedCount = 0;
  const moreMatch = body.match(/ \+(\d+) more$/);
  if (moreMatch) {
    omittedCount = Number.parseInt(moreMatch[1], 10);
    body = body.slice(0, -moreMatch[0].length);
  }

  let truncated = false;
  const names: ParsedSaleName[] = [];
  for (const segment of body.split(", ")) {
    const part = segment.trim();
    if (part.length === 0) continue;
    // "Name ×2" — the multiplier the description collapses duplicates into.
    const qtyMatch = part.match(/^(.*) ×(\d+)$/);
    const name = qtyMatch ? qtyMatch[1] : part;
    const quantity = qtyMatch ? Number.parseInt(qtyMatch[2], 10) : 1;
    if (name.endsWith("…")) truncated = true;
    names.push({ name, quantity });
  }

  return { names, omittedCount, truncated };
}

// ─── Matching names back to the catalogue ────────────────────────────────────

export interface CatalogueEntry {
  id: number;
  name: string;
  /** Decimal CHF, as the products table stores it. */
  price: string;
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve description segments to catalogue products.
 *
 * The description joins names with ", " and a product name may itself contain
 * a comma ("Ring, oxidised"), which makes a naive split ambiguous. So segments
 * are re-joined greedily, longest run first, and a run only counts as a match
 * if it is a name the catalogue actually has — the catalogue, not the
 * punctuation, decides where one item ends and the next begins.
 */
export function matchNamesToProducts(
  names: ParsedSaleName[],
  catalogue: CatalogueEntry[],
): {
  matched: Array<{ product: CatalogueEntry; quantity: number }>;
  unmatched: string[];
} {
  const byName = new Map<string, CatalogueEntry>();
  for (const product of catalogue) {
    // First listing of a duplicated name wins; either is as good a guess.
    const key = normalise(product.name);
    if (!byName.has(key)) byName.set(key, product);
  }

  const matched: Array<{ product: CatalogueEntry; quantity: number }> = [];
  const unmatched: string[] = [];

  let index = 0;
  while (index < names.length) {
    let consumed = 0;
    for (let span = names.length - index; span >= 1; span--) {
      const run = names.slice(index, index + span);
      // Only the LAST segment of a run can carry the "×N" multiplier, so a
      // run spanning several segments must not swallow an inner quantity.
      if (run.slice(0, -1).some((n) => n.quantity !== 1)) continue;
      const candidate = run.map((n) => n.name).join(", ");
      const product = byName.get(normalise(candidate));
      if (product) {
        matched.push({ product, quantity: run[run.length - 1].quantity });
        consumed = span;
        break;
      }
    }
    if (consumed === 0) {
      unmatched.push(names[index].name);
      consumed = 1;
    }
    index += consumed;
  }

  return { matched, unmatched };
}

// ─── Reconstruction ──────────────────────────────────────────────────────────

export interface ReconstructedLine {
  productId: number | null;
  name: string | null;
  priceRappen: number;
}

export type ReconstructionOutcome =
  /** Names resolved AND the total is exactly accounted for — safe to write. */
  | { status: "exact"; lines: ReconstructedLine[] }
  /**
   * We know what sold but not what each line cost. Reported, never written:
   * the names are useful, an invented price is not.
   */
  | { status: "unpriced"; names: string[]; reason: string }
  /** The description isn't ours, is empty, or named nothing we could match. */
  | { status: "unresolved"; reason: string };

function listPriceRappen(product: CatalogueEntry): number {
  return Math.round(Number(product.price) * 100);
}

/**
 * Turn a parsed description into line items, or explain why it can't be done.
 */
export function reconstructLineItems(
  parsed: ParsedDescription | null,
  catalogue: CatalogueEntry[],
  totalRappen: number,
): ReconstructionOutcome {
  if (!parsed) {
    return {
      status: "unresolved",
      reason: "payment has no description this app wrote",
    };
  }
  if (parsed.names.length === 0) {
    return { status: "unresolved", reason: "description named no items" };
  }

  const { matched, unmatched } = matchNamesToProducts(parsed.names, catalogue);
  const allNames = parsed.names.map((n) =>
    n.quantity > 1 ? `${n.name} ×${n.quantity}` : n.name,
  );

  if (matched.length === 0) {
    return {
      status: "unresolved",
      reason: `no catalogue product matches ${allNames.join(", ")}`,
    };
  }

  // A description that had to drop items, hard-truncate a name, or that names
  // something the catalogue no longer has, cannot be a complete basket — and
  // an incomplete basket can never account for the total.
  if (parsed.omittedCount > 0) {
    return {
      status: "unpriced",
      names: allNames,
      reason: `description omitted ${parsed.omittedCount} further item(s)`,
    };
  }
  if (parsed.truncated) {
    return {
      status: "unpriced",
      names: allNames,
      reason: "a name was truncated to fit the description",
    };
  }
  if (unmatched.length > 0) {
    return {
      status: "unpriced",
      names: allNames,
      reason: `no catalogue product matches ${unmatched.join(", ")}`,
    };
  }

  // Expand quantities: "Ring ×2" was two separate line items when sold.
  const units = matched.flatMap(({ product, quantity }) =>
    Array.from({ length: quantity }, () => product),
  );

  // One item in the sale: it was charged the order total, whatever the
  // catalogue says today. This is the case that survives bargaining.
  if (units.length === 1) {
    return {
      status: "exact",
      lines: [{ productId: units[0].id, name: null, priceRappen: totalRappen }],
    };
  }

  const listTotal = units.reduce((sum, p) => sum + listPriceRappen(p), 0);
  if (listTotal === totalRappen) {
    return {
      status: "exact",
      lines: units.map((p) => ({
        productId: p.id,
        name: null,
        priceRappen: listPriceRappen(p),
      })),
    };
  }

  return {
    status: "unpriced",
    names: allNames,
    reason:
      `list prices total CHF ${(listTotal / 100).toFixed(2)} but the sale ` +
      `charged CHF ${(totalRappen / 100).toFixed(2)} — probably bargained, ` +
      `so per-item prices can't be recovered`,
  };
}

// ─── The run ─────────────────────────────────────────────────────────────────

export interface BackfillSkippedOrder {
  posOrderId: number;
  totalChf: string;
  createdAt: string;
  /** Names recovered from the description, if any — the useful part. */
  names: string[];
  reason: string;
}

export interface BackfillSummary {
  /** Paid POS orders found with no line items at all. */
  scanned: number;
  /** Of those, how many had a Stripe PaymentIntent to read a description from. */
  withStripePayment: number;
  /** Cash sales — no Stripe payment, so nothing to reconstruct from, ever. */
  cashUnrecoverable: number;
  /** Orders whose line items were reconstructed exactly. */
  restored: number;
  /** Line item rows written (or that would be, on a dry run). */
  lineItemsWritten: number;
  /** Missing KPOS-{id} references filled in — exact, so always applied. */
  invoiceNumbersFilled: number;
  /** Orders we could name but not price, plus those we could not read at all. */
  skipped: BackfillSkippedOrder[];
  /** True when nothing was written and this was only a preview. */
  dryRun: boolean;
}

export interface BackfillOptions {
  /** Preview by default: a backfill should be read before it is believed. */
  dryRun?: boolean;
  limit?: number;
  /** Retrieve a PaymentIntent — injectable so tests never touch the network. */
  retrievePaymentIntent?: (id: string) => Promise<Stripe.PaymentIntent | null>;
}

/**
 * Read PaymentIntents from the account they were actually created on. A store
 * that has connected its own Stripe account took its card payments there, and
 * retrieving those ids from the platform account finds nothing at all — which
 * would look exactly like "no description to recover from".
 */
async function makeRetriever(
  tenantId: number,
): Promise<(id: string) => Promise<Stripe.PaymentIntent | null>> {
  const stripe = getStripe();
  if (!stripe) return async () => null;
  const tenant = await getTenantById(tenantId);
  const options = tenant?.stripeConnectedAccountId
    ? { stripeAccount: tenant.stripeConnectedAccountId }
    : undefined;
  return async (id: string) => {
    try {
      // The account goes in the third argument (RequestOptions); the second is
      // query params, which this call has none of.
      return await stripe.paymentIntents.retrieve(id, undefined, options);
    } catch (err) {
      console.warn(`[PosBackfill] Could not retrieve ${id}:`, err);
      return null;
    }
  };
}

/**
 * Reconstruct what can be reconstructed. Idempotent: it only ever considers
 * orders that have NO line items, so a second run sees only what the first
 * one left behind.
 */
export async function backfillPosLineItems(
  tenantId: number,
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const dryRun = options.dryRun ?? true;
  const limit = Math.min(
    options.limit ?? MAX_ORDERS_SCANNED,
    MAX_ORDERS_SCANNED,
  );
  const retrieve =
    options.retrievePaymentIntent ?? (await makeRetriever(tenantId));

  const orders = await getPaidPosOrdersMissingLineItems(tenantId, limit);
  const catalogue: CatalogueEntry[] = (await getAllProducts(tenantId)).map(
    (p) => ({ id: p.id, name: p.name, price: p.price }),
  );

  const summary: BackfillSummary = {
    scanned: orders.length,
    withStripePayment: 0,
    cashUnrecoverable: 0,
    restored: 0,
    lineItemsWritten: 0,
    invoiceNumbersFilled: 0,
    skipped: [],
    dryRun,
  };

  for (const order of orders) {
    const totalChf = (order.totalRappen / 100).toFixed(2);
    const createdAt = order.createdAt.toISOString();

    // The invoice number is derivable with certainty, so it is filled in for
    // every order here — including the cash ones nothing else can help.
    if (!order.invoiceNumber) {
      if (!dryRun) {
        await setPosOrderInvoiceNumber(tenantId, order.id, `KPOS-${order.id}`);
      }
      summary.invoiceNumbersFilled++;
    }

    if (!order.stripePaymentIntentId) {
      summary.cashUnrecoverable++;
      summary.skipped.push({
        posOrderId: order.id,
        totalChf,
        createdAt,
        names: [],
        reason: "cash sale — never went through Stripe, nothing to read",
      });
      continue;
    }

    summary.withStripePayment++;
    const intent = await retrieve(order.stripePaymentIntentId);
    const outcome = reconstructLineItems(
      parsePosSaleDescription(intent?.description),
      catalogue,
      order.totalRappen,
    );

    if (outcome.status === "exact") {
      if (!dryRun) {
        await insertPosOrderItems(
          tenantId,
          outcome.lines.map((line) => ({ ...line, posOrderId: order.id })),
        );
      }
      summary.restored++;
      summary.lineItemsWritten += outcome.lines.length;
      continue;
    }

    summary.skipped.push({
      posOrderId: order.id,
      totalChf,
      createdAt,
      names: outcome.status === "unpriced" ? outcome.names : [],
      reason: outcome.reason,
    });
  }

  return summary;
}
