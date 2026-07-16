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
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const adminEmail = process.env.ADMIN_EMAIL ?? "shwena9@gmail.com";
  const jwtSecret = process.env.JWT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "[GoogleOAuth] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
    );
  }
  if (!jwtSecret) {
    console.error("[GoogleOAuth] JWT_SECRET must be set");
  }

  return { clientId, clientSecret, adminEmail, jwtSecret };
}

function getRedirectUri(req: Request): string {
  // Support X-Forwarded-Proto for reverse proxies (Caddy)
  const proto =
    req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return `${proto}://${host}/api/oauth/callback`;
}

// ── Session JWT ───────────────────────────────────────────────────────────────

async function signSessionJwt(openId: string, name: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ openId, appId: "google", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(key);
}

export async function verifySessionJwt(
  token: string | undefined | null,
  secret: string
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
  sub: string;       // unique Google user ID
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
};

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
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

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
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
      res.status(500).send("Google OAuth is not configured (missing GOOGLE_CLIENT_ID)");
      return;
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
      const tokens = await exchangeCodeForTokens(code, redirectUri, clientId, clientSecret);
      const userInfo = await fetchGoogleUserInfo(tokens.access_token);

      // Only allow the designated admin email
      if (userInfo.email.toLowerCase() !== adminEmail.toLowerCase()) {
        res.status(403).send(
          `Access denied. Only ${adminEmail} is authorised to log in.`
        );
        return;
      }

      // Upsert user in DB — always admin role for the allowed email
      const openId = `google:${userInfo.sub}`;
      await db.upsertUser({
        openId,
        name: userInfo.name,
        email: userInfo.email,
        loginMethod: "google",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const sessionToken = await signSessionJwt(openId, userInfo.name, jwtSecret);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/admin");
    } catch (err) {
      console.error("[GoogleOAuth] Callback error:", err);
      res.status(500).send("Authentication failed. Please try again.");
    }
  });
}
