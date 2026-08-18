/**
 * Lifetime rules for the one-click tokens in the review emails.
 *
 * These links carry no session: the whole point is that a merchant can act on
 * one from their inbox. That makes each token a bearer credential — anyone
 * holding the mail can spend it — so it needs the two properties a password
 * would have. It must stop working after a while, and it must stop existing
 * once it has been used.
 *
 * The admin console's pending queue (`pendingReview.ts`) is the durable path
 * and needs none of this: it authenticates the admin's own session and
 * addresses rows by id, so an expired or spent link never locks a merchant out
 * of a decision — it only sends them to the console to make it.
 */

/**
 * How long a mailed link stays live. Long enough for a merchant who reconciles
 * at the weekend, short enough that a mailbox leaked months later is inert.
 * Re-sending an outstanding item (a re-run of the scan) extends it from the
 * day of that send.
 */
export const REVIEW_TOKEN_TTL_DAYS = 14;

/** When a token issued or re-sent now should stop working. */
export function reviewTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + REVIEW_TOKEN_TTL_DAYS * 86400 * 1000);
}

/**
 * Fails closed: a row with no expiry is treated as expired rather than as
 * "never expires". Rows predating the column are backfilled by the migration,
 * so a NULL here means something wrote a token without a lifetime — which
 * should stop a link working, not grant it an unlimited one.
 */
export function isReviewTokenExpired(
  row: { tokenExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!row.tokenExpiresAt) return true;
  return row.tokenExpiresAt.getTime() <= now.getTime();
}
