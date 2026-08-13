/**
 * Email magic-link sign-in — the passwordless fallback for anyone whose email
 * provider isn't Google or Apple. Two halves:
 *
 *   1. `auth.requestMagicLink` (tRPC mutation, server/routers.ts) creates a
 *      one-time token and emails a link — see requestMagicLink below.
 *   2. GET /api/auth/magic-link/callback (this file's Express route) is what
 *      that link points at: consumes the token, upserts the user, and issues
 *      the same signed session JWT cookie every sign-in method uses.
 *
 * Split this way (rather than one tRPC mutation) because step 2 must run as a
 * plain browser navigation — it's a link clicked from a mail client, not an
 * XHR/fetch the SPA controls — and needs to set a cookie + redirect, exactly
 * like the Google/Apple OAuth callbacks in oauth.ts / appleAuth.ts.
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { getPlatformRootDomain } from "./platformDomain";
import {
  getCanonicalOrigin,
  sanitizeNextTarget,
  signSessionJwt,
} from "./oauth";
import { sendMagicLinkEmail } from "./email";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Creates a one-time token, emails the sign-in link, and reports whether the
 * email actually went out. Called from the `auth.requestMagicLink` tRPC
 * procedure, which has the request/response context this needs (building the
 * link's canonical origin) but none of the token/email mechanics.
 */
export async function requestMagicLink(opts: {
  email: string;
  next: unknown;
  req: Request;
}): Promise<{ emailed: boolean; previewUrl?: string }> {
  const email = opts.email.trim().toLowerCase();
  const next = sanitizeNextTarget(opts.next, getPlatformRootDomain());
  const token = crypto.randomBytes(24).toString("hex");

  await db.createMagicLinkToken({
    email,
    token,
    next,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });

  const url = `${getCanonicalOrigin(opts.req)}/api/auth/magic-link/callback?token=${token}`;

  let emailed = false;
  try {
    emailed = await sendMagicLinkEmail({ to: email, url });
  } catch (err) {
    console.warn("[MagicLink] Send failed:", err);
  }

  // Only hand the raw link back to the caller when mail genuinely isn't
  // configured (local/dev) — never when a real send just failed, since that
  // would leak a login link for whatever address the client typed in.
  const previewUrl = !emailed && !process.env.RESEND_API_KEY ? url : undefined;
  return { emailed, previewUrl };
}

export function registerMagicLinkRoutes(app: Express) {
  app.get(
    "/api/auth/magic-link/callback",
    async (req: Request, res: Response) => {
      const token =
        typeof req.query.token === "string" ? req.query.token : null;
      if (!token) {
        res.status(400).send("Missing sign-in token");
        return;
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        res.status(500).send("Server auth configuration is incomplete");
        return;
      }

      try {
        const record = await db.getMagicLinkTokenByToken(token);
        if (
          !record ||
          record.consumedAt ||
          record.expiresAt.getTime() < Date.now()
        ) {
          res
            .status(400)
            .send(
              "This sign-in link is invalid or has expired. Please request a new one.",
            );
          return;
        }

        // Burn it before doing anything else — a link is single-use even if
        // something below fails.
        await db.consumeMagicLinkToken(record.id);

        const adminEmail = process.env.ADMIN_EMAIL ?? "shwena9@gmail.com";
        const isPlatformAdmin =
          record.email.toLowerCase() === adminEmail.toLowerCase();

        const name = record.email.split("@")[0] || record.email;

        // Sign in as the account this address ALREADY has, when it has one
        // that manages a store.
        //
        // Without this, a link mints `email:<addr>` — a second openId, and so
        // a second account, for one person. openId is the unique key and the
        // session JWT carries it (sdk.ts resolves via getUserByOpenId), so the
        // merchant lands as a stranger: upsertUser parks a tenant-less sign-in
        // on DEFAULT_TENANT_ID with role `customer` (see its tenantId ?? …),
        // and their store is nowhere in sight. Assigning the tenant here
        // instead would leave two admin rows on it — two staff seats, one
        // human — so the fix belongs at the identity, not the tenancy.
        //
        // Safe because both halves are verified: clicking the link proves this
        // inbox, and the email on the matched row came from its provider and
        // is not user-editable (see updateOwnDisplayName, which refuses to let
        // anyone type in an address and "inherit whatever a future
        // email-keyed lookup grants" — this lookup). The same reasoning
        // already backs tenant.resumeClaim.
        //
        // Two matches means a multi-store owner and no way to tell which store
        // was meant, so that falls through rather than guessing into the wrong
        // admin. Nobody with a managing account is affected the other way: a
        // storefront customer has no match and keeps today's behaviour exactly.
        const managing = await db.getManagingUsersByEmail(record.email);
        const adopt = managing.length === 1 ? managing[0] : null;
        if (managing.length > 1) {
          console.warn(
            `[MagicLink] ${managing.length} managing accounts for this address; ` +
              `signing in as a new identity rather than guessing which store.`,
          );
        }

        const openId = adopt ? adopt.openId : `email:${record.email}`;
        if (adopt) {
          // Only the timestamp. name/email/loginMethod belong to the provider
          // this row was minted against; overwriting them would relabel a
          // Google account as a magic-link one on every use of the fallback.
          await db.touchUserLastSignedIn(adopt.id, new Date());
        } else {
          await db.upsertUser({
            openId,
            name,
            email: record.email,
            loginMethod: "magic_link",
            ...(isPlatformAdmin ? { role: "admin" as const } : {}),
            lastSignedIn: new Date(),
          });
        }

        const sessionToken = await signSessionJwt(
          openId,
          name,
          jwtSecret,
          "email",
        );
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });

        const next = sanitizeNextTarget(record.next, getPlatformRootDomain());
        res.redirect(302, next ?? (isPlatformAdmin ? "/admin" : "/"));
      } catch (err) {
        console.error("[MagicLink] Callback error:", err);
        res.status(500).send("Authentication failed. Please try again.");
      }
    },
  );
}
