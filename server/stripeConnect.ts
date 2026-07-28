/**
 * Stripe Connect (Standard) — lets each tenant link their OWN Stripe account
 * for their storefront's checkout, separate from Zolto's own
 * stripe_customer_id/stripe_subscription_id (Zolto billing the tenant for the
 * platform subscription — see server/stripe.ts). A tenant's customers pay
 * into their connected account directly; Zolto never touches that money and
 * takes no cut (see docs/planning/phase1/marketing/pricing-page-copy.md).
 *
 * Flow:
 *   1. An admin calls tenant.getStripeConnectUrl (server/routers/tenant.ts) →
 *      a signed, tenant-scoped `state` + Stripe's OAuth authorize URL.
 *   2. The tenant connects (or creates) a Stripe Standard account on Stripe's
 *      own onboarding pages.
 *   3. Stripe redirects to GET /api/stripe/connect/callback?code=...&state=...
 *   4. We exchange the code for the connected account id, verify `state`,
 *      and save tenants.stripe_connected_account_id.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY        — Zolto's own (platform) secret key. Also used
 *                              to call stripe.oauth.token on the platform's
 *                              behalf (see server/stripe.ts getStripe()).
 *   STRIPE_CONNECT_CLIENT_ID — the platform's Connect OAuth client id
 *                              (ca_...), from the Stripe Dashboard's Connect
 *                              settings. [PLACEHOLDER — not set until the
 *                              founder creates a Stripe account and enables
 *                              Connect.]
 *   JWT_SECRET                — reused to sign/verify the `state` param
 *                              (same secret as server/_core/oauth.ts).
 *
 * Strongly recommended:
 *   PUBLIC_BASE_URL           — canonical platform origin the OAuth redirect_uri
 *                              is built from (see getRedirectUri below). Without
 *                              it, the redirect_uri is derived from the request's
 *                              own host, which breaks for every tenant subdomain
 *                              except whichever one happens to be registered in
 *                              the Stripe Dashboard's Connect OAuth settings —
 *                              the same class of bug fixed for Google OAuth in
 *                              server/_core/oauth.ts.
 *
 * If STRIPE_CONNECT_CLIENT_ID (or JWT_SECRET) is unset, connecting is
 * disabled — buildConnectAuthorizeUrl returns null.
 */
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getStripe } from "./stripe";
import { setTenantStripeConnectAccount } from "./db";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — just long enough to finish the OAuth round-trip

async function signState(tenantId: number, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + STATE_TTL_MS) / 1000))
    .sign(key);
}

async function verifyState(
  state: string,
  secret: string,
): Promise<number | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(state, key, { algorithms: ["HS256"] });
    return typeof payload.tenantId === "number" ? payload.tenantId : null;
  } catch {
    return null;
  }
}

// Stripe requires an exact, pre-registered redirect_uri — no wildcard
// subdomains. So the OAuth round-trip always uses ONE canonical origin
// (PUBLIC_BASE_URL, set in every deploy mode), never the request's own host —
// otherwise every tenant subdomain (blah.zolto.ch) would need its own entry
// in the Stripe Dashboard's Connect OAuth settings, which doesn't scale for a
// self-serve multi-tenant app. Falls back to the request's own origin only
// when PUBLIC_BASE_URL isn't configured (e.g. a single-host self-hosted
// deploy that hasn't set it). Same fix as server/_core/oauth.ts getRedirectUri
// for the identical Google OAuth redirect_uri_mismatch bug.
function getRedirectUri(req: Request): string {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) {
    try {
      return `${new URL(base).origin}/api/stripe/connect/callback`;
    } catch {
      // fall through to the request-derived origin
    }
  }
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return `${proto}://${host}/api/stripe/connect/callback`;
}

/**
 * Builds the Stripe Connect OAuth authorize URL for a tenant to link their
 * own Standard account. Returns null when Connect isn't configured
 * (STRIPE_CONNECT_CLIENT_ID / JWT_SECRET unset) so callers can surface a
 * clear "not available yet" message instead of a broken link.
 */
export async function buildConnectAuthorizeUrl(
  tenantId: number,
  req: Request,
): Promise<string | null> {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  const jwtSecret = process.env.JWT_SECRET;
  if (!clientId || !jwtSecret) return null;

  const state = await signState(tenantId, jwtSecret);
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("redirect_uri", getRedirectUri(req));
  url.searchParams.set("state", state);
  return url.toString();
}

export function registerStripeConnectRoutes(app: Express): void {
  app.get(
    "/api/stripe/connect/callback",
    async (req: Request, res: Response) => {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      const state =
        typeof req.query.state === "string" ? req.query.state : null;
      const error =
        typeof req.query.error === "string" ? req.query.error : null;

      if (error) {
        res.redirect(
          302,
          `/admin?stripeConnect=error&reason=${encodeURIComponent(error)}`,
        );
        return;
      }
      if (!code || !state) {
        res.status(400).send("Missing code or state");
        return;
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        res.status(500).send("Server configuration incomplete");
        return;
      }

      const tenantId = await verifyState(state, jwtSecret);
      if (!tenantId) {
        res
          .status(400)
          .send("Invalid or expired link — please try connecting again.");
        return;
      }

      const stripe = getStripe();
      if (!stripe) {
        res.status(500).send("Stripe is not configured on the platform");
        return;
      }

      try {
        const response = await stripe.oauth.token({
          grant_type: "authorization_code",
          code,
        });
        const connectedAccountId = response.stripe_user_id;
        if (!connectedAccountId) {
          throw new Error("Stripe OAuth response missing stripe_user_id");
        }
        await setTenantStripeConnectAccount(tenantId, connectedAccountId);
        res.redirect(302, "/admin?stripeConnect=success");
      } catch (err) {
        console.error("[StripeConnect] OAuth exchange failed:", err);
        res.redirect(302, "/admin?stripeConnect=error");
      }
    },
  );
}
