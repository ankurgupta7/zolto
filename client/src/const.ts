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

/** The app's own sign-in page (both surfaces route it). */
export const SIGNIN_PATH = "/signin";

/**
 * Where to send a signed-out visitor. This is the app's sign-in PAGE, which
 * offers every method — unlike getLoginUrl/getAppleLoginUrl above, which hand
 * off to one specific provider. Anything reacting to "not signed in" (an
 * expired session, a 401, an auth guard) should point here, so no path into
 * the app forces a merchant through an identity provider they don't use.
 *
 * `returnUrl` is normally `window.location.href` — an absolute url, so a
 * merchant on their own store subdomain comes back to it rather than to the
 * canonical host the OAuth round-trip passes through.
 */
export const getSignInPath = (returnUrl?: string) =>
  returnUrl
    ? `${SIGNIN_PATH}?next=${encodeURIComponent(returnUrl)}`
    : SIGNIN_PATH;
