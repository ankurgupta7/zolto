/**
 * Discount codes — the rules, with no database and no Stripe in sight.
 *
 * Everything here is pure so the same arithmetic can be trusted in three
 * places that must never disagree: the admin preview ("this code takes CHF 12
 * off a CHF 60 basket"), the storefront's live check as the shopper types, and
 * the checkout session that actually charges the card. A discount computed one
 * way in the basket and another way at the till is a support ticket at best
 * and an unhappy chargeback at worst.
 *
 * Money is in Rappen (integer minor units) throughout, matching orders and the
 * platform fee. Percentages are whole numbers 1–100 — Stripe accepts fractional
 * percent_off, but "12.5% off" is not a promotion anyone runs, and integers keep
 * the rounding rule (below) to a single place.
 */

// ─── Code shape ───────────────────────────────────────────────────────────────

/**
 * The alphabet generated codes are drawn from: upper-case letters and digits
 * with I, O, 0 and 1 removed. Codes get read off a phone screen, a flyer at a
 * market stall, or dictated over the counter, and those four are the pairs
 * people mis-key. 32 symbols exactly, which also makes `byte % 32` an unbiased
 * draw from a random byte (256 is a whole multiple of 32).
 */
export const DISCOUNT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Matches the `code` column in drizzle/schema.ts. */
export const MAX_DISCOUNT_CODE_LENGTH = 32;

/** Default random part length — 8 symbols ≈ 40 bits, far past guessing. */
export const DEFAULT_DISCOUNT_CODE_LENGTH = 8;

/** Most codes one batch may mint in a single admin action. */
export const MAX_BATCH_SIZE = 500;

/**
 * The canonical form of a code as typed by a human: upper-cased, with spaces
 * and punctuation other than the joining dash removed. "friends family" and
 * "  Friends-Family  " and "friends–family" all have to reach the same row,
 * because the merchant prints one of them and the customer types another.
 *
 * Returns "" for input that has nothing usable in it, which callers treat as
 * "no code supplied" rather than "code not found".
 */
export function normaliseDiscountCode(
  input: string | null | undefined,
): string {
  if (!input) return "";
  return (
    input
      .toUpperCase()
      // En/em dashes and underscores are what a word processor or a phone
      // keyboard turns a typed hyphen into.
      .replace(/[‐-―_]/g, "-")
      .replace(/[^A-Z0-9-]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_DISCOUNT_CODE_LENGTH)
  );
}

/** Injectable randomness, so tests can assert the exact code produced. */
export type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
};

/**
 * One code. With a prefix ("FRIENDS") the result is "FRIENDS-7K3P9QME": the
 * prefix is what the campaign is called and the tail is what makes the code
 * un-guessable, so a friends-and-family code can't be brute-forced off the
 * back of a promo code someone found on Instagram.
 */
export function generateDiscountCode(
  opts: {
    prefix?: string;
    length?: number;
    randomBytes?: RandomBytes;
  } = {},
): string {
  const length = Math.max(
    4,
    Math.min(24, opts.length ?? DEFAULT_DISCOUNT_CODE_LENGTH),
  );
  const randomBytes = opts.randomBytes ?? defaultRandomBytes;
  const bytes = randomBytes(length);

  let tail = "";
  for (let i = 0; i < length; i++) {
    tail +=
      DISCOUNT_CODE_ALPHABET[(bytes[i] ?? 0) % DISCOUNT_CODE_ALPHABET.length];
  }

  const prefix = normaliseDiscountCode(opts.prefix ?? "");
  const joined = prefix ? `${prefix}-${tail}` : tail;
  return joined.slice(0, MAX_DISCOUNT_CODE_LENGTH);
}

/**
 * A batch of distinct codes — the "generate 50 for the Christmas market"
 * action. De-duplicates rather than trusting randomness, because a collision
 * inside one batch would be inserted as one row and hand two customers the
 * same single-use code. Gives up after a bounded number of attempts and
 * returns what it has, so a caller can never spin here.
 */
export function generateDiscountCodes(
  count: number,
  opts: { prefix?: string; length?: number; randomBytes?: RandomBytes } = {},
): string[] {
  const wanted = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(count)));
  const seen = new Set<string>();
  for (
    let attempts = 0;
    seen.size < wanted && attempts < wanted * 10;
    attempts++
  ) {
    seen.add(generateDiscountCode(opts));
  }
  return Array.from(seen);
}

// ─── Terms and evaluation ─────────────────────────────────────────────────────

export type DiscountKind = "percent" | "amount";

/**
 * The stored terms of a code, as the pure rules need them. Deliberately a
 * plain structural type rather than the Drizzle row type: the admin preview
 * evaluates terms the merchant is still typing and has not saved anywhere.
 */
export interface DiscountTerms {
  kind: DiscountKind;
  /** Whole percent (1–100) for "percent", Rappen for "amount". */
  value: number;
  /** Only meaningful for "amount" — a fixed CHF 10 off is not EUR 10 off. */
  currency?: string | null;
  minSubtotalRappen?: number | null;
  /** null = unlimited. */
  maxRedemptions?: number | null;
  redeemedCount?: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  active?: boolean;
}

/** Why a code was refused. The storefront maps these to translated copy. */
export type DiscountRefusal =
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted"
  | "below_minimum"
  | "currency_mismatch";

export type DiscountEvaluation =
  | { ok: true; amountOffRappen: number }
  | { ok: false; reason: DiscountRefusal; message: string };

/**
 * What this code takes off a basket, in Rappen, ignoring whether the code is
 * currently usable — `evaluateDiscount` owns that question.
 *
 * Two rules worth stating out loud:
 * - Percentages round DOWN (`Math.floor`). Half a Rappen has to go somewhere,
 *   and giving it to the merchant rather than the shopper is the direction
 *   that can never make a total end up negative after other rounding.
 * - The result is clamped to the subtotal. A CHF 20 code on a CHF 15 basket
 *   discounts CHF 15, never CHF 20 — Stripe would reject a negative line
 *   total, and "we owe you CHF 5" is not a thing a shop does.
 */
export function discountAmountRappen(
  terms: Pick<DiscountTerms, "kind" | "value">,
  subtotalRappen: number,
): number {
  const subtotal = Math.max(0, Math.floor(subtotalRappen));
  if (subtotal === 0) return 0;

  if (terms.kind === "percent") {
    const percent = Math.min(100, Math.max(0, Math.floor(terms.value)));
    return Math.min(subtotal, Math.floor((subtotal * percent) / 100));
  }
  return Math.min(subtotal, Math.max(0, Math.floor(terms.value)));
}

/**
 * Is this code usable on this basket, right now — and if so, for how much?
 *
 * Order matters: the reasons are checked from "this code is not for you" to
 * "this code is for you, but not yet". A shopper who is CHF 5 short of the
 * minimum should be told that (they can act on it), not that the code expired
 * — and someone holding a code that ran out should not be told to spend more
 * to find that out.
 */
export function evaluateDiscount(params: {
  terms: DiscountTerms;
  subtotalRappen: number;
  /** The basket's currency, lower-case ISO ("chf"). */
  currency?: string | null;
  now?: Date;
}): DiscountEvaluation {
  const { terms, subtotalRappen } = params;
  const now = params.now ?? new Date();

  if (terms.active === false) {
    return {
      ok: false,
      reason: "inactive",
      message: "That discount code is no longer available.",
    };
  }

  if (terms.startsAt && now < terms.startsAt) {
    return {
      ok: false,
      reason: "not_started",
      message: "That discount code isn't active yet.",
    };
  }

  if (terms.expiresAt && now >= terms.expiresAt) {
    return {
      ok: false,
      reason: "expired",
      message: "That discount code has expired.",
    };
  }

  if (
    terms.maxRedemptions != null &&
    (terms.redeemedCount ?? 0) >= terms.maxRedemptions
  ) {
    return {
      ok: false,
      reason: "exhausted",
      message: "That discount code has already been fully redeemed.",
    };
  }

  // A fixed amount is denominated in one currency. Applying "CHF 10 off" to a
  // EUR basket would silently take EUR 10 off instead — a bigger discount than
  // the merchant wrote, in a currency they never agreed to.
  if (
    terms.kind === "amount" &&
    terms.currency &&
    params.currency &&
    terms.currency.toLowerCase() !== params.currency.toLowerCase()
  ) {
    return {
      ok: false,
      reason: "currency_mismatch",
      message: `That discount code only applies to ${terms.currency.toUpperCase()} orders.`,
    };
  }

  if (
    terms.minSubtotalRappen != null &&
    subtotalRappen < terms.minSubtotalRappen
  ) {
    return {
      ok: false,
      reason: "below_minimum",
      message: `That discount code needs a basket of at least ${formatMinorUnits(
        terms.minSubtotalRappen,
        params.currency ?? terms.currency ?? "chf",
      )}.`,
    };
  }

  return {
    ok: true,
    amountOffRappen: discountAmountRappen(terms, subtotalRappen),
  };
}

/**
 * "CHF 50.00" from 5000 Rappen. Only used inside refusal messages — every
 * price the storefront renders goes through client/src/lib/money.ts, which
 * knows about locales; this is the server-side sentence that has to be
 * assembled where no locale is in scope.
 */
export function formatMinorUnits(minor: number, currency: string): string {
  return `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`;
}

/**
 * How a code reads in the admin list and on a share card: "20% off",
 * "CHF 15.00 off".
 */
export function describeDiscount(
  terms: Pick<DiscountTerms, "kind" | "value" | "currency">,
): string {
  if (terms.kind === "percent") return `${Math.floor(terms.value)}% off`;
  return `${formatMinorUnits(terms.value, terms.currency ?? "chf")} off`;
}

/**
 * The link a merchant sends to a friend: the storefront with the code already
 * in the URL, so nobody has to type it. The storefront reads `?discount=` on
 * load and pre-fills the checkout field.
 */
export function discountShareUrl(baseUrl: string, code: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/shop?discount=${encodeURIComponent(code)}`;
}
