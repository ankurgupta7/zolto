/**
 * What can safely be done to a connected account, and what cannot.
 *
 * Separated from the script so the rules are testable without touching a real
 * Stripe account — the one place where getting it wrong is expensive.
 *
 * The distinction that matters is ownership. A Standard connected account
 * BELONGS TO THE MERCHANT, not to Zolto: they signed up with Stripe directly
 * and Zolto merely holds an authorisation to act for them. There is no version
 * of "delete" that is Zolto's to perform — the only correct action is to
 * deauthorize, which severs the link and leaves the merchant's business intact.
 * Deleting is available for accounts the platform itself created and owns
 * (Custom/Express), and for anything in test mode, which is disposable.
 */

export interface CleanupAccount {
  id: string;
  /** Stripe's account type. "none" for newer controller-based accounts. */
  type?: string | null;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  /** Present when this account is a live one. */
  livemode?: boolean;
}

export type CleanupAction =
  /** Remove it outright — ours to delete, or test data. */
  | { kind: "delete"; reason: string }
  /** Sever the authorisation; the merchant keeps their account. */
  | { kind: "deauthorize"; reason: string }
  /** Do nothing, and say why. */
  | { kind: "skip"; reason: string };

export interface CleanupOptions {
  /** True when operating with a live secret key. */
  live: boolean;
  /** The operator explicitly accepted acting on live data. */
  liveConfirmed: boolean;
}

export function actionFor(
  account: CleanupAccount,
  opts: CleanupOptions,
): CleanupAction {
  if (opts.live && !opts.liveConfirmed) {
    return {
      kind: "skip",
      reason:
        "live account, and live mode was not explicitly confirmed — refusing " +
        "to touch a real merchant relationship by default",
    };
  }

  if (!opts.live) {
    // Test accounts are disposable by design: nothing real is attached and
    // Stripe permits deletion regardless of type.
    return { kind: "delete", reason: "test-mode account — disposable" };
  }

  if (account.type === "standard") {
    return {
      kind: "deauthorize",
      reason:
        "Standard account — it belongs to the merchant, not to Zolto. " +
        "Disconnecting is the most we may do; deleting is not ours to perform",
    };
  }

  return {
    kind: "delete",
    reason: `platform-owned account (type ${account.type ?? "unknown"})`,
  };
}

/**
 * A one-line, scannable summary of the plan. Written so an operator reading a
 * dry run can spot the wrong thing BEFORE it happens, which is the only moment
 * that matters.
 */
export function describePlan(
  entries: { account: CleanupAccount; action: CleanupAction }[],
): { deletes: number; deauthorizes: number; skips: number; lines: string[] } {
  let deletes = 0;
  let deauthorizes = 0;
  let skips = 0;
  const lines: string[] = [];

  for (const { account, action } of entries) {
    if (action.kind === "delete") deletes++;
    else if (action.kind === "deauthorize") deauthorizes++;
    else skips++;

    const verb = action.kind.toUpperCase().padEnd(12);
    lines.push(`  ${verb} ${account.id}  — ${action.reason}`);
  }

  return { deletes, deauthorizes, skips, lines };
}
