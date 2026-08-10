/**
 * Deciding whether Zolto's platform fee actually worked.
 *
 * The fee is the one part of the pricing model that no test could prove:
 * `application_fee_amount` is only meaningful once a REAL Stripe account
 * accepts it and a REAL charge settles with it. Everything up to that point —
 * the bps maths, the plan lookup, the param shape — is unit-tested and has
 * always passed, which is exactly why it was never the thing to trust.
 *
 * This module holds the judgement, separated from the network work in
 * scripts/verify-platform-fee.ts so it can be tested without touching Stripe.
 *
 * The failure that matters most is not a loud one. If Stripe rejects the fee,
 * checkoutSession.ts retries without it and the sale still completes — so a
 * broken Connect relationship looks like a working storefront that silently
 * earns nothing. `missing` below is that case, and it must never be reported
 * as a pass just because the payment succeeded.
 */

export interface FeeObservation {
  /** What Zolto's own pricing code said to charge, in Rappen. */
  expectedFeeRappen: number;
  /**
   * The application fee Stripe actually recorded on the settled charge, in
   * Rappen. `null` means the charge settled with no application fee at all.
   */
  observedFeeRappen: number | null;
  /** Stripe refused to create the charge rather than settling it. */
  rejected?: boolean;
  /**
   * For a rejection: did `isPlatformFeeRejection()` recognise it? A rejection
   * we fail to recognise is worse than one we do — the fee-stripping retry
   * never fires, so the vendor loses the whole sale instead of just our cut.
   */
  rejectionRecognised?: boolean;
}

export type FeeVerdictKind =
  /** Expected a fee, Stripe collected exactly that. The result we want. */
  | "collected"
  /** Expected nothing, took nothing. Correct for Pro. */
  | "not_charged"
  /** Expected a fee, the charge settled without one. Silent revenue loss. */
  | "missing"
  /** A fee was collected, but not the amount our code intended. */
  | "mismatch"
  /** Expected nothing, but a fee was taken anyway. Overcharging a Pro tenant. */
  | "overcharged"
  /** Stripe refused the charge outright. */
  | "rejected";

export interface FeeVerdict {
  kind: FeeVerdictKind;
  pass: boolean;
  message: string;
}

/** Rappen → a human "CHF 1.23". */
export function chf(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}

export function verdictFor(obs: FeeObservation): FeeVerdict {
  const { expectedFeeRappen: want, observedFeeRappen: got } = obs;

  if (obs.rejected) {
    return {
      kind: "rejected",
      pass: false,
      message: obs.rejectionRecognised
        ? `Stripe refused the ${chf(want)} platform fee. isPlatformFeeRejection() ` +
          `recognised it, so a real checkout would retry without the fee and the ` +
          `sale would still complete — but every online order earns Zolto nothing ` +
          `until the Connect relationship is fixed.`
        : `Stripe refused the ${chf(want)} platform fee AND isPlatformFeeRejection() ` +
          `did not recognise the error. That is the worse case: the retry never ` +
          `fires, so this failure takes the vendor's entire online storefront down ` +
          `rather than costing Zolto 1%. Widen the classifier to cover it.`,
    };
  }

  // Charging a merchant who has paid to not be charged is worse than failing
  // to charge one who should be, so it is checked before the happy paths.
  if (want === 0 && got !== null && got > 0) {
    return {
      kind: "overcharged",
      pass: false,
      message:
        `Took ${chf(got)} from an order that should have carried no fee. A Pro ` +
        `tenant is paying twice. Stop charging before anything else.`,
    };
  }

  if (want === 0) {
    return {
      kind: "not_charged",
      pass: true,
      message: "No fee expected and none taken — correct for the Pro plan.",
    };
  }

  if (got === null || got === 0) {
    return {
      kind: "missing",
      pass: false,
      message:
        `Expected ${chf(want)} but the charge settled with no application fee. ` +
        `The sale went through, so nothing looks broken from the outside — this ` +
        `is the silent-loss case. Check whether the fee was stripped by the ` +
        `retry in checkoutSession.ts, and why.`,
    };
  }

  if (got !== want) {
    return {
      kind: "mismatch",
      pass: false,
      message:
        `Expected ${chf(want)} but Stripe collected ${chf(got)}. The fee reaches ` +
        `Stripe, so the Connect relationship is fine — the arithmetic or the ` +
        `subtotal it is applied to is not.`,
    };
  }

  return {
    kind: "collected",
    pass: true,
    message: `Stripe collected exactly ${chf(want)} onto the platform account.`,
  };
}

/**
 * The overall answer. A run passes only if every case passed — a Free-plan fee
 * that lands is not proof of anything if the Pro case also charged.
 */
export function summarise(results: { label: string; verdict: FeeVerdict }[]): {
  pass: boolean;
  failed: string[];
} {
  const failed = results.filter((r) => !r.verdict.pass).map((r) => r.label);
  return { pass: failed.length === 0 && results.length > 0, failed };
}
