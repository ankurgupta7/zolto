/**
 * Full-page navigation helpers.
 *
 * Cross-surface moves (marketing → storefront/admin) and server routes (the
 * OAuth handshake at /api/oauth/login) must be *real* browser navigations, not
 * wouter route changes: the surface is resolved once at app mount, so a
 * client-side route change into the other surface just 404s in the current
 * router (see lib/surface.ts).
 *
 * These live behind a function rather than inline `window.location` writes so
 * callers stay unit-testable — jsdom's `window.location` is non-configurable, so
 * a component that writes it directly cannot be asserted on without a real
 * browser. Tests `vi.mock("@/lib/navigate")` instead.
 */

/**
 * Navigate the browser to `url`.
 *
 * `replace` swaps the current history entry instead of pushing a new one — the
 * right choice for a bounce page (e.g. /signin), so that pressing Back from the
 * destination returns to wherever the visitor actually came from rather than
 * re-triggering the redirect.
 */
export function hardRedirect(url: string, { replace = false } = {}): void {
  if (typeof window === "undefined") return;
  if (replace) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
}
