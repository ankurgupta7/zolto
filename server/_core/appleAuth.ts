/**
 * Apple "Sign in with Apple" OAuth 2.0 handler
 *
 * Flow:
 *   1. GET  /api/oauth/apple/login     → redirect to Apple's consent screen
 *   2. Apple POSTs (response_mode=form_post, Apple's requirement whenever the
 *      `name`/`email` scopes are requested) to /api/oauth/apple/callback
 *   3. Exchange the code for tokens. Apple has no static client secret —
 *      instead we self-sign a short-lived ES256 JWT with the private key
 *      downloaded once from the Apple Developer portal (buildClientSecret).
 *   4. Verify the returned id_token against Apple's published JWKS, extract
 *      the stable user id (sub) and email
 *   5. Issue the same signed session JWT cookie every sign-in method uses
 *      (see server/_core/oauth.ts signSessionJwt) — Apple is just another
 *      identity provider, not a separate session mechanism.
 *
 * Required env vars:
 *   APPLE_CLIENT_ID     — the Services ID registered for Sign in with Apple
 *                         (e.g. "ch.zolto.web"), NOT the app's bundle id.
 *   APPLE_TEAM_ID       — Apple Developer Team ID
 *   APPLE_KEY_ID        — Key ID of the "Sign in with Apple" private key
 *   APPLE_PRIVATE_KEY   — that key's .p8 contents (PEM). Literal "\n"
 *                         sequences are unescaped, since most env-var stores
 *                         can't hold real newlines.
 *   ADMIN_EMAIL, JWT_SECRET — shared with Google OAuth (see oauth.ts); the
 *                         platform owner can sign in with either provider.
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import {
  SignJWT,
  importPKCS8,
  jwtVerify,
  createRemoteJWKSet,
  type JWTPayload,
} from "jose";
import { parse as parseCookieHeader } from "cookie";
import crypto from "node:crypto";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { getPlatformRootDomain } from "./platformDomain";
import {
  NEXT_COOKIE,
  getCanonicalOrigin,
  sanitizeNextTarget,
  signSessionJwt,
} from "./oauth";

// CSRF guard for Apple's callback: unlike Google's GET redirect, Apple's
// callback is a real top-level form POST, which a third-party page could
// forge (an attacker auto-submitting their own valid Apple `code` into a
// victim's browser — "login CSRF"). A random value round-tripped through a
// cookie only Zolto could have set closes that off.
const STATE_COOKIE = "apple_oauth_state";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getAppleJwks() {
  if (!jwks)
    jwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  return jwks;
}

function getConfig() {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const adminEmail = process.env.ADMIN_EMAIL ?? "shwena9@gmail.com";
  const jwtSecret = process.env.JWT_SECRET;

  if (!clientId || !teamId || !keyId || !privateKey) {
    console.error(
      "[AppleOAuth] APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY must be set",
    );
  }
  if (!jwtSecret) {
    console.error("[AppleOAuth] JWT_SECRET must be set");
  }

  return { clientId, teamId, keyId, privateKey, adminEmail, jwtSecret };
}

// Apple, like Google, requires an exact pre-registered redirect_uri — so this
// always round-trips through the same canonical origin as Google's callback
// (see oauth.ts's getCanonicalOrigin), just a different path.
function getRedirectUri(req: Request): string {
  return `${getCanonicalOrigin(req)}/api/oauth/apple/callback`;
}

// ── Apple client secret (self-signed, short-lived) ─────────────────────────────

async function buildClientSecret(config: {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
}): Promise<string> {
  const key = await importPKCS8(config.privateKey, "ES256");
  const nowSec = Math.floor(Date.now() / 1000);
  return (
    new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: config.keyId })
      .setIssuer(config.teamId)
      .setIssuedAt(nowSec)
      // Minted fresh on every token exchange, so 5 minutes is plenty — well
      // under Apple's 6-month maximum.
      .setExpirationTime(nowSec + 5 * 60)
      .setAudience("https://appleid.apple.com")
      .setSubject(config.clientId)
      .sign(key)
  );
}

// ── Apple API helpers ────────────────────────────────────────────────────────

type AppleTokenResponse = {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
};

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<AppleTokenResponse> {
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Apple token exchange failed (${res.status}): ${detail}`);
  }

  return res.json();
}

async function verifyAppleIdToken(
  idToken: string,
  clientId: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(idToken, getAppleJwks(), {
    issuer: "https://appleid.apple.com",
    audience: clientId,
  });
  return payload;
}

// Apple only sends the user's name in the `user` form field, and only on the
// very FIRST authorization ever — every later sign-in omits it. Best-effort
// parse; absence just falls back to the email below.
function parseAppleUserName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as {
      name?: { firstName?: string; lastName?: string };
    };
    const first = parsed.name?.firstName?.trim();
    const last = parsed.name?.lastName?.trim();
    const full = [first, last].filter(Boolean).join(" ");
    return full || null;
  } catch {
    return null;
  }
}

// ── Express routes ────────────────────────────────────────────────────────────

export function registerAppleOAuthRoutes(app: Express) {
  // Step 1 — Initiate Apple login
  app.get("/api/oauth/apple/login", (req: Request, res: Response) => {
    const { clientId } = getConfig();
    if (!clientId) {
      res
        .status(500)
        .send("Apple Sign In is not configured (missing APPLE_CLIENT_ID)");
      return;
    }

    const cookieOptions = getSessionCookieOptions(req);

    const next = sanitizeNextTarget(req.query.next, getPlatformRootDomain());
    if (next) {
      res.cookie(NEXT_COOKIE, next, {
        ...cookieOptions,
        maxAge: 10 * 60 * 1000,
      });
    } else {
      res.clearCookie(NEXT_COOKIE, cookieOptions);
    }

    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, {
      ...cookieOptions,
      maxAge: 10 * 60 * 1000,
    });

    const redirectUri = getRedirectUri(req);
    const url = new URL("https://appleid.apple.com/auth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "form_post");
    url.searchParams.set("scope", "name email");
    url.searchParams.set("state", state);

    res.redirect(302, url.toString());
  });

  // Step 2 — Apple callback (form_post: a real POST, not a query-string GET)
  app.post("/api/oauth/apple/callback", async (req: Request, res: Response) => {
    const { clientId, teamId, keyId, privateKey, adminEmail, jwtSecret } =
      getConfig();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code : null;
    const error = typeof body.error === "string" ? body.error : null;

    if (error) {
      res.status(400).send(`Apple Sign In error: ${error}`);
      return;
    }
    if (!code) {
      res.status(400).send("Missing authorization code");
      return;
    }
    if (!clientId || !teamId || !keyId || !privateKey || !jwtSecret) {
      res.status(500).send("Server OAuth configuration is incomplete");
      return;
    }

    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expectedState = cookies[STATE_COOKIE];
    const returnedState = typeof body.state === "string" ? body.state : null;
    const cookieOptions = getSessionCookieOptions(req);
    if (!expectedState || !returnedState || expectedState !== returnedState) {
      res.clearCookie(STATE_COOKIE, cookieOptions);
      res
        .status(400)
        .send("Invalid or expired sign-in attempt. Please try again.");
      return;
    }
    res.clearCookie(STATE_COOKIE, cookieOptions);

    try {
      const redirectUri = getRedirectUri(req);
      const clientSecret = await buildClientSecret({
        teamId,
        keyId,
        privateKey,
        clientId,
      });
      const tokens = await exchangeCodeForTokens(
        code,
        redirectUri,
        clientId,
        clientSecret,
      );
      const idTokenPayload = await verifyAppleIdToken(
        tokens.id_token,
        clientId,
      );

      const sub =
        typeof idTokenPayload.sub === "string" ? idTokenPayload.sub : null;
      if (!sub) throw new Error("Apple id_token is missing sub");
      const email =
        typeof idTokenPayload.email === "string" ? idTokenPayload.email : null;
      const name = parseAppleUserName(body.user) ?? email ?? "Apple User";

      // Same self-serve model as Google: any Apple account can sign in; only
      // the configured ADMIN_EMAIL is granted the platform-admin role.
      const isPlatformAdmin =
        !!email && email.toLowerCase() === adminEmail.toLowerCase();

      const openId = `apple:${sub}`;
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "apple",
        ...(isPlatformAdmin ? { role: "admin" as const } : {}),
        lastSignedIn: new Date(),
      });

      const sessionToken = await signSessionJwt(
        openId,
        name,
        jwtSecret,
        "apple",
      );
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      const next = sanitizeNextTarget(
        cookies[NEXT_COOKIE],
        getPlatformRootDomain(),
      );
      res.clearCookie(NEXT_COOKIE, cookieOptions);
      res.redirect(302, next ?? (isPlatformAdmin ? "/admin" : "/"));
    } catch (err) {
      console.error("[AppleOAuth] Callback error:", err);
      res.status(500).send("Authentication failed. Please try again.");
    }
  });
}
