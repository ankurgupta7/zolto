/**
 * What to tell a merchant who taps "Connect Stripe".
 *
 * Extracted from the click handler because these four outcomes are easy to
 * conflate and expensive to get wrong. The original code showed
 * "Stripe Connect isn't set up on the platform yet. Contact support." whenever
 * `data?.url` was falsy — which is also true while the query is still in
 * flight, and true when the request failed. So a slow network or a transient
 * error accused Gwinn of a misconfiguration it may not have and sent the
 * merchant to support over nothing.
 *
 * Only the server actually returning `url === null` means the platform is
 * genuinely unconfigured (see server/stripeConnect.ts buildConnectAuthorizeUrl,
 * which returns null when STRIPE_CONNECT_CLIENT_ID or JWT_SECRET is unset).
 */

export interface ConnectQueryState {
  data?: { url: string | null } | undefined;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  error?: { message: string } | null;
}

export type ConnectPrompt =
  /** Send the merchant to Stripe. */
  | { kind: "redirect"; url: string }
  /** Still checking — say so rather than blaming the platform. */
  | { kind: "pending"; message: string }
  /** The request failed; surface the real reason and invite a retry. */
  | { kind: "error"; message: string }
  /** The server told us Connect isn't configured. Support is the right answer. */
  | { kind: "unconfigured"; message: string };

export function resolveConnectPrompt(state: ConnectQueryState): ConnectPrompt {
  if (state.data?.url) return { kind: "redirect", url: state.data.url };

  // Loading is checked before error so a refetch after a failure reads as
  // "checking" rather than surfacing a stale error the user can't act on.
  if (state.isLoading || state.isFetching) {
    return {
      kind: "pending",
      message: "Still checking your payment setup — one moment.",
    };
  }

  if (state.isError) {
    const detail = state.error?.message?.trim();
    return {
      kind: "error",
      message: detail
        ? `Couldn't check your payment setup: ${detail}. Please try again.`
        : "Couldn't check your payment setup. Please try again.",
    };
  }

  return {
    kind: "unconfigured",
    message:
      "Stripe Connect isn't set up on the platform yet. Contact support.",
  };
}
