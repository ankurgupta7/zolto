/**
 * Google OAuth 2.0 handler
 *
 * Flow:
 *   1. GET /api/oauth/login  → redirect to Google consent screen
 *   2. Google redirects to GET /api/oauth/callback?code=...
 *   3. Exchange code for tokens, fetch user profile
 *   4. Allow only ADMIN_EMAIL; set role=admin for that user
 *   5. Issue a signed JWT session cookie
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID      — from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET  — from Google Cloud Console
 *   ADMIN_EMAIL           — the only email allowed to log in as admin (shwena9@gmail.com)
 *   JWT_SECRET            — session cookie signing secret (32+ chars)
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { getPlatformRootDomain } from "./platformDomain";

// Cookie that carries the post-login redirect target across the OAuth round-trip
// (set on /login, consumed on /callback). Kept separate from the session cookie.
// Shared across every OAuth-style provider (Google, Apple) — only one such
// round-trip is ever in flight per browser tab, so reusing the same cookie
// name is safe and keeps the "where do I send you back" mechanism in one place.
export const NEXT_COOKIE = "oauth_next";

function isSafeNextString(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (raw.length === 0 || raw.length > 512) return false;
  // No control chars or whitespace (defends against header/redirect smuggling).
  for (let i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) <= 0x20) return false;
  }
  return true;
}

// Validate a post-login redirect target. Only same-origin absolute paths are
// allowed, so a crafted `?next=` can't turn login into an open redirect to an
// attacker's site. Returns the safe path or null.
export function sanitizeNextPath(raw: unknown): string | null {
  if (!isSafeNextString(raw)) return null;
  // Must start with a single "/" (a rooted path), never "//" or "/\" (which
  // browsers treat as protocol-relative → another origin).
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

// Like sanitizeNextPath, but also allows an absolute https URL when it points
// at the platform's own root domain or one of its tenant subdomains. Needed
// because OAuth always round-trips through one canonical host (see
// getRedirectUri below) — a tenant admin signing in from blah.gwinn.ch needs
// to land back on blah.gwinn.ch, not the canonical host's homepage, and that
// return target is a different origin than the callback itself. Still never
// allows redirecting to an unrelated host.
export function sanitizeNextTarget(
  raw: unknown,
  rootDomain: string | null,
): string | null {
  const relative = sanitizeNextPath(raw);
  if (relative) return relative;
  if (!isSafeNextString(raw) || !rootDomain) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== rootDomain && !host.endsWith(`.${rootDomain}`)) return null;
  return `${url.origin}${url.pathname}${url.search}`;
}

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const adminEmail = process.env.ADMIN_EMAIL ?? "shwena9@gmail.com";
  const jwtSecret = process.env.JWT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "[GoogleOAuth] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set",
    );
  }
  if (!jwtSecret) {
    console.error("[GoogleOAuth] JWT_SECRET must be set");
  }

  return { clientId, clientSecret, adminEmail, jwtSecret };
}

// Google requires an exact, pre-registered redirect_uri — no wildcard
// subdomains. So the OAuth round-trip always uses ONE canonical origin
// (PUBLIC_BASE_URL, set in every deploy mode), never the request's own host —
// otherwise every tenant subdomain (blah.gwinn.ch) would need its own entry
// in Google Cloud Console's authorized redirect URIs, which doesn't scale for
// a self-serve multi-tenant app. Falls back to the request's own origin only
// when PUBLIC_BASE_URL isn't configured (e.g. a single-host self-hosted
// deploy that hasn't set it).
// Shared by every OAuth-style provider: resolves the one canonical origin the
// round-trip always uses (see the redirect_uri comment above), independent of
// which provider-specific callback path gets appended to it.
export function getCanonicalOrigin(req: Request): string {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) {
    try {
      return new URL(base).origin;
    } catch {
      // fall through to the request-derived origin
    }
  }
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return `${proto}://${host}`;
}

function getRedirectUri(req: Request): string {
  return `${getCanonicalOrigin(req)}/api/oauth/callback`;
}

// ── Session JWT ───────────────────────────────────────────────────────────────

// appId records which identity provider issued the session — informational
// only (see server/_core/sdk.ts, which authenticates purely on openId), but
// useful for support/debugging when a user has signed in via more than one
// provider over time.
export async function signSessionJwt(
  openId: string,
  name: string,
  secret: string,
  appId: string = "google",
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ openId, appId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(key);
}

export async function verifySessionJwt(
  token: string | undefined | null,
  secret: string,
): Promise<{ openId: string; appId: string; name: string } | null> {
  if (!token) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const { openId, appId, name } = payload as Record<string, unknown>;
    if (
      typeof openId !== "string" ||
      typeof appId !== "string" ||
      typeof name !== "string"
    )
      return null;
    return { openId, appId, name };
  } catch {
    return null;
  }
}

// ── Google API helpers ────────────────────────────────────────────────────────

type GoogleTokenResponse = {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
};

type GoogleUserInfo = {
  sub: string; // unique Google user ID
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
};

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
    throw new Error(`Google token exchange failed (${res.status}): ${detail}`);
  }

  return res.json();
}

async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Google userinfo failed (${res.status}): ${detail}`);
  }

  return res.json();
}

// ── Express routes ────────────────────────────────────────────────────────────

export function registerOAuthRoutes(app: Express) {
  // Step 1 — Initiate Google login
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const { clientId } = getConfig();
    if (!clientId) {
      res
        .status(500)
        .send("Google OAuth is not configured (missing GOOGLE_CLIENT_ID)");
      return;
    }

    // Remember where to send the user back after login (e.g. the signup claim
    // page, or a tenant's own admin subdomain). Stashed in a short-lived
    // cookie and consumed on the callback. The cookie itself is scoped by
    // getSessionCookieOptions, which widens its domain across the platform's
    // subdomains when applicable, so it survives the hop from a tenant
    // subdomain to the canonical host the callback runs on.
    const next = sanitizeNextTarget(req.query.next, getPlatformRootDomain());
    if (next) {
      res.cookie(NEXT_COOKIE, next, {
        ...getSessionCookieOptions(req),
        maxAge: 10 * 60 * 1000, // 10 minutes — just long enough to finish OAuth
      });
    } else {
      res.clearCookie(NEXT_COOKIE, getSessionCookieOptions(req));
    }

    const redirectUri = getRedirectUri(req);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");

    res.redirect(302, url.toString());
  });

  // Step 2 — Google callback
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const { clientId, clientSecret, adminEmail, jwtSecret } = getConfig();
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const error = typeof req.query.error === "string" ? req.query.error : null;

    if (error) {
      res.status(400).send(`Google OAuth error: ${error}`);
      return;
    }

    if (!code) {
      res.status(400).send("Missing authorization code");
      return;
    }

    if (!clientId || !clientSecret || !jwtSecret) {
      res.status(500).send("Server OAuth configuration is incomplete");
      return;
    }

    try {
      const redirectUri = getRedirectUri(req);
      const tokens = await exchangeCodeForTokens(
        code,
        redirectUri,
        clientId,
        clientSecret,
      );
      const userInfo = await fetchGoogleUserInfo(tokens.access_token);

      // Gwinn is multi-tenant self-serve: any Google account can sign in. The
      // configured ADMIN_EMAIL is the platform admin and is granted the admin
      // role directly; everyone else signs in as a regular user and becomes an
      // admin only by claiming a store they created (tenant.claimAdmin).
      const isPlatformAdmin =
        userInfo.email.toLowerCase() === adminEmail.toLowerCase();

      // Upsert the user. Only force the role for the platform admin — leaving it
      // undefined otherwise means a returning store admin keeps the admin role
      // they earned by claiming, instead of being demoted back to "user" on
      // every login (upsertUser only overwrites role when one is supplied).
      const openId = `google:${userInfo.sub}`;
      await db.upsertUser({
        openId,
        name: userInfo.name,
        email: userInfo.email,
        loginMethod: "google",
        ...(isPlatformAdmin ? { role: "admin" as const } : {}),
        lastSignedIn: new Date(),
      });

      const sessionToken = await signSessionJwt(
        openId,
        userInfo.name,
        jwtSecret,
      );
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      // Send the user back where they started (the claim page, or their own
      // tenant subdomain), if a safe next was stashed on login; otherwise the
      // platform admin lands on /admin and a fresh self-serve user on the
      // home page.
      const cookies = parseCookieHeader(req.headers.cookie ?? "");
      const next = sanitizeNextTarget(
        cookies[NEXT_COOKIE],
        getPlatformRootDomain(),
      );
      res.clearCookie(NEXT_COOKIE, getSessionCookieOptions(req));
      res.redirect(302, next ?? (isPlatformAdmin ? "/admin" : "/"));
    } catch (err) {
      console.error("[GoogleOAuth] Callback error:", err);
      res.status(500).send("Authentication failed. Please try again.");
    }
  });
}
