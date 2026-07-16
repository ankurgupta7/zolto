/**
 * Session authentication helper — Google OAuth edition
 *
 * Verifies the signed JWT session cookie issued by the Google OAuth callback.
 * No Manus OAuth dependency; uses jose for JWT verification.
 */

import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { verifySessionJwt } from "./oauth";
import { ENV } from "./env";

export type AuthenticatedUser = User;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

class SDKServer {
  private parseCookies(cookieHeader: string | undefined): Map<string, string> {
    if (!cookieHeader) return new Map();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);

    const jwtSecret = process.env.JWT_SECRET ?? ENV.cookieSecret;
    const session = await verifySessionJwt(sessionCookie, jwtSecret);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      throw ForbiddenError("User not found — please log in again");
    }

    return user;
  }

  // Kept for backward-compat with any code that calls sdk.createSessionToken
  async createSessionToken(_openId: string, _opts?: unknown): Promise<string> {
    throw new Error("createSessionToken: use the Google OAuth callback instead");
  }
}

export const sdk = new SDKServer();
