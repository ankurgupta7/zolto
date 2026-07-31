export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the URL to initiate Google OAuth login. The server handles the
 * redirect to Google and the callback (always via one canonical host, since
 * Google requires an exact pre-registered redirect_uri). `returnPath` can be
 * a same-origin relative path (e.g. the signup claim step) or, to return to a
 * tenant's own subdomain admin panel after login, an absolute URL such as
 * `window.location.href` — the server only honors it if it resolves back to
 * the platform's own root domain or a subdomain of it.
 */
export const getLoginUrl = (returnPath?: string) => {
  const base = "/api/oauth/login";
  return returnPath ? `${base}?next=${encodeURIComponent(returnPath)}` : base;
};

/** Same contract as getLoginUrl, for the Apple Sign In round-trip. */
export const getAppleLoginUrl = (returnPath?: string) => {
  const base = "/api/oauth/apple/login";
  return returnPath ? `${base}?next=${encodeURIComponent(returnPath)}` : base;
};
