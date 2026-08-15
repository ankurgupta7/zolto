/**
 * Admin navigation manifest — the single source of truth for the admin area's
 * information architecture (docs/ARCHITECTURE-ADMIN.md §2.2).
 *
 * The sidebar, the router, plan gates, and onboarding tour targets all derive
 * from this list, so they can never drift apart. Pure data + pure functions:
 * no React, no tRPC — icon names are resolved by the shell.
 *
 * The admin serves two relationships, mirrored by `plane`:
 * - "store": the tenant's own rented website and POS (daily surface)
 * - "account": the tenant's relationship with Zolto (billing, team, credits…)
 */

import { PLANS } from "@shared/platform";

/** Plan ids, ordered cheapest → most expensive (PLANS is the source of truth). */
export type AdminPlanId = (typeof PLANS)[number]["id"];

/** Tenant staff roles that may see the admin area (matches users.role). */
export type AdminRole = "staff" | "admin" | "superadmin";

export type AdminPlane = "store" | "account";

export interface AdminNavItem {
  /** Stable id — referenced by tours, checklist hrefs, and tests. */
  id: string;
  plane: AdminPlane;
  label: string;
  /** lucide-react icon name; the shell maps it to a component. */
  icon: string;
  path: string;
  /** Minimum role. Default: "staff" (any team member). */
  requiredRole?: AdminRole;
  /** Minimum plan. Default: "free". Insufficient plan → locked + upsell. */
  requiredPlan?: AdminPlanId;
}

export const ADMIN_NAV: AdminNavItem[] = [
  // ── Store plane — "My shop" ──────────────────────────────────────────────
  {
    id: "home",
    plane: "store",
    label: "Home",
    icon: "LayoutDashboard",
    path: "/admin",
  },
  {
    id: "products",
    plane: "store",
    label: "Products",
    icon: "Package",
    path: "/admin/products",
  },
  {
    id: "import",
    plane: "store",
    label: "Import",
    icon: "Upload",
    path: "/admin/products/import",
  },
  {
    id: "categories",
    plane: "store",
    label: "Categories",
    icon: "Tags",
    path: "/admin/categories",
    requiredRole: "admin",
  },
  {
    id: "orders",
    plane: "store",
    label: "Orders",
    icon: "Receipt",
    path: "/admin/orders",
  },
  {
    id: "reconciliation",
    plane: "store",
    label: "Reconciliation",
    icon: "ClipboardCheck",
    path: "/admin/reconciliation",
  },
  {
    id: "storefront",
    plane: "store",
    label: "Storefront",
    icon: "Palette",
    path: "/admin/storefront",
  },
  {
    id: "testimonials",
    plane: "store",
    label: "Reviews",
    icon: "Quote",
    path: "/admin/testimonials",
    requiredRole: "admin",
  },
  {
    id: "discounts",
    plane: "store",
    label: "Discounts",
    icon: "TicketPercent",
    path: "/admin/discounts",
    requiredRole: "admin",
  },
  {
    id: "domain",
    plane: "store",
    label: "Domain",
    icon: "Globe",
    path: "/admin/domain",
    requiredPlan: "pro",
  },
  {
    id: "channels",
    plane: "store",
    label: "Channels",
    icon: "MessagesSquare",
    path: "/admin/channels",
  },
  { id: "pos", plane: "store", label: "POS", icon: "Nfc", path: "/admin/pos" },
  {
    id: "insights",
    plane: "store",
    label: "Insights",
    icon: "BarChart3",
    path: "/admin/insights",
    requiredPlan: "pro",
  },

  // ── Account plane — "My Zolto account" (owner/admin by default) ─────────
  {
    id: "account",
    plane: "account",
    label: "Shop profile",
    icon: "Store",
    path: "/admin/account",
    requiredRole: "admin",
  },
  // The signed-in person, as opposed to the shop. Open to any staff member:
  // everyone with a login has a name and a session to manage, and gating this
  // at "admin" is what left staff with nowhere to see their own account.
  {
    id: "me",
    plane: "account",
    label: "My account",
    icon: "UserRound",
    path: "/admin/account/me",
  },
  {
    id: "team",
    plane: "account",
    label: "Team",
    icon: "Users",
    path: "/admin/account/team",
    requiredRole: "admin",
  },
  {
    id: "plan",
    plane: "account",
    label: "Plan & billing",
    icon: "CreditCard",
    path: "/admin/account/plan",
    requiredRole: "admin",
  },
  {
    id: "credits",
    plane: "account",
    label: "AI usage",
    icon: "Sparkles",
    path: "/admin/account/credits",
    requiredRole: "admin",
  },
  {
    id: "keys",
    plane: "account",
    label: "Keys & access",
    icon: "KeyRound",
    path: "/admin/account/keys",
    requiredRole: "admin",
  },
  {
    id: "data",
    plane: "account",
    label: "Data & privacy",
    icon: "DatabaseBackup",
    path: "/admin/account/data",
    requiredRole: "admin",
  },
  {
    id: "support",
    plane: "account",
    label: "Support",
    icon: "LifeBuoy",
    path: "/admin/account/support",
  },
  {
    id: "legal",
    plane: "account",
    label: "Legal & invoices",
    icon: "FileText",
    path: "/admin/account/legal",
    requiredRole: "admin",
  },

  // ── Zolto's own operations — the platform owner only ─────────────────────
  {
    id: "platform",
    plane: "account",
    label: "Platform metrics",
    icon: "Activity",
    path: "/admin/account/platform",
    requiredRole: "superadmin",
  },
];

// ─── Access resolution ──────────────────────────────────────────────────────

/** "open" renders normally; "locked" renders with a plan-upsell; "hidden" is not rendered. */
export type NavAccess = "open" | "locked" | "hidden";

export interface ResolvedNavItem extends AdminNavItem {
  access: NavAccess;
}

// The platform owner acts as a tenant admin everywhere in the store/account
// planes, and additionally sees the platform plane — hence a rank ABOVE admin
// rather than equal to it. Anything gated at "admin" stays visible to them.
const ROLE_RANK: Record<AdminRole, number> = {
  staff: 0,
  admin: 1,
  superadmin: 2,
};

/**
 * Whether a role may operate a store's admin area: admin, or the platform
 * owner (who outranks admin everywhere — see ROLE_RANK).
 *
 * Use this instead of comparing to the literal "admin": pages that checked
 * `role === "admin"` locked the platform owner out of their own store the
 * moment they were promoted to superadmin.
 */
export function isStoreAdminRole(role: string | undefined | null): boolean {
  return role === "admin" || role === "superadmin";
}

/**
 * Plan rank comes from the PLANS array order (shared/platform.ts is the
 * source of truth), so a re-priced or re-ordered tier can't drift from gates.
 */
const PLAN_RANK: Record<AdminPlanId, number> = Object.fromEntries(
  PLANS.map((p, i) => [p.id, i]),
) as Record<AdminPlanId, number>;

/**
 * Resolve what the sidebar may show for a given viewer. Display-only — the
 * server enforces the same rules via tRPC middleware; hiding is UX, not
 * security (docs/ARCHITECTURE-ADMIN.md §4).
 */
export function resolveNavAccess(
  items: AdminNavItem[],
  viewer: { role: AdminRole; plan: AdminPlanId },
): ResolvedNavItem[] {
  return items.map((item) => {
    const requiredRole = item.requiredRole ?? "staff";
    if (ROLE_RANK[viewer.role] < ROLE_RANK[requiredRole]) {
      return { ...item, access: "hidden" };
    }
    const requiredPlan = item.requiredPlan ?? "free";
    if (PLAN_RANK[viewer.plan] < PLAN_RANK[requiredPlan]) {
      return { ...item, access: "locked" };
    }
    return { ...item, access: "open" };
  });
}

/**
 * Which nav item a path belongs to, by longest match.
 *
 * A plain `startsWith` lights up every ancestor: on /admin/account/team both
 * "Shop profile" (/admin/account) and "Team" match, and on /admin every single
 * store-plane item does. Nested paths are the norm in the account plane, so
 * the most specific item wins and the rest stay unhighlighted.
 */
export function activeNavId(
  items: AdminNavItem[],
  path: string,
): string | null {
  let best: AdminNavItem | null = null;
  for (const item of items) {
    const matches = path === item.path || path.startsWith(`${item.path}/`);
    if (matches && (!best || item.path.length > best.path.length)) {
      best = item;
    }
  }
  return best?.id ?? null;
}

// ─── Sidebar grouping ───────────────────────────────────────────────────────

export interface NavGroup {
  plane: AdminPlane;
  /** Display title for the sidebar section ("Shop" / "Zolto account"). */
  title: string;
  items: ResolvedNavItem[];
}

const PLANE_TITLES: Record<AdminPlane, string> = {
  store: "Shop",
  account: "Zolto account",
};

/**
 * Group resolved items by plane for the sidebar. Hidden items are dropped;
 * locked items stay (rendered with an upsell affordance by the shell).
 * Groups with nothing to show are omitted entirely.
 */
export function groupNavByPlane(items: ResolvedNavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const plane of ["store", "account"] as const) {
    const visible = items.filter(
      (i) => i.plane === plane && i.access !== "hidden",
    );
    if (visible.length > 0) {
      groups.push({ plane, title: PLANE_TITLES[plane], items: visible });
    }
  }
  return groups;
}
