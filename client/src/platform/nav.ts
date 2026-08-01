/**
 * Operator console navigation — Zolto's own back office, not a merchant's.
 *
 * Kept separate from client/src/admin/nav.ts on purpose. That manifest
 * describes a *tenant's* admin and is resolved against their role and plan;
 * this one describes the platform owner's console, where there is exactly one
 * audience (superadmin) and no plan gating. Merging them is what produced the
 * original problem: the operator dashboard was a `requiredRole: "superadmin"`
 * item buried in the merchant sidebar, so it only existed on a merchant's
 * subdomain and only for a role nothing granted.
 */

export interface PlatformNavItem {
  id: string;
  label: string;
  /** lucide-react icon name; the shell maps it to a component. */
  icon: string;
  path: string;
}

export const PLATFORM_NAV: PlatformNavItem[] = [
  { id: "metrics", label: "Metrics", icon: "Activity", path: "/platform" },
  { id: "tenants", label: "Stores", icon: "Store", path: "/platform/stores" },
];

/** True for paths the console owns, so the marketing router can hand them over. */
export function isPlatformPath(path: string): boolean {
  return path === "/platform" || path.startsWith("/platform/");
}

/**
 * Which nav item a path belongs to. Longest matching path wins so
 * `/platform/stores/7` highlights "Stores" rather than "Metrics" (which sits
 * at the bare `/platform` prefix and would otherwise match everything).
 */
export function activePlatformNavId(path: string): string | null {
  let best: PlatformNavItem | null = null;
  for (const item of PLATFORM_NAV) {
    const matches = path === item.path || path.startsWith(`${item.path}/`);
    if (matches && (!best || item.path.length > best.path.length)) {
      best = item;
    }
  }
  return best?.id ?? null;
}
