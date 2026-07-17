export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the URL to initiate Google OAuth login. The server handles the
 * redirect to Google and the callback. When `returnPath` (a same-origin
 * absolute path) is given, the server sends the user back there after login —
 * used by the signup flow to return to the claim step.
 */
export const getLoginUrl = (returnPath?: string) => {
  const base = "/api/oauth/login";
  return returnPath ? `${base}?next=${encodeURIComponent(returnPath)}` : base;
};
