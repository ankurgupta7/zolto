export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the URL to initiate Google OAuth login.
 * The server handles the redirect to Google and the callback.
 */
export const getLoginUrl = (_returnPath?: string) => {
  return "/api/oauth/login";
};
