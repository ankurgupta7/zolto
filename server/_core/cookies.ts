import type { CookieOptions, Request } from "express";
import { getPlatformRootDomain, isPlatformHost } from "./platformDomain";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}

function requestHostname(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.headers.host;
  return raw?.split(":")[0].toLowerCase();
}

/**
 * Session cookie options. On the platform's own domain (zolto.ch, or
 * zolto.kalakosh.ch alongside Kalakosh-ch) and its tenant subdomains, the
 * cookie domain is widened to `.{root}` so a session established on one host
 * (e.g. the canonical host Google OAuth redirects back to) is also valid on
 * every tenant subdomain — see oauth.ts's cross-subdomain login flow. Tenant
 * custom domains (shop.example.com) and local dev fall back to a host-only
 * cookie, since widening to a foreign domain isn't possible (or meaningful).
 */
export function getSessionCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const root = getPlatformRootDomain();
  const hostname = requestHostname(req);
  const domain = isPlatformHost(hostname, root) ? `.${root}` : undefined;

  return {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}
