import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  activeNavId,
  groupNavByPlane,
  isStoreAdminRole,
  resolveNavAccess,
} from "./nav";

describe("ADMIN_NAV manifest", () => {
  it("has unique ids", () => {
    const ids = ADMIN_NAV.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique paths, all under /admin", () => {
    const paths = ADMIN_NAV.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) {
      expect(p.startsWith("/admin")).toBe(true);
    }
  });

  it("covers both planes: the shop and the Zolto account", () => {
    const planes = new Set(ADMIN_NAV.map((i) => i.plane));
    expect(planes).toEqual(new Set(["store", "account"]));
  });
});

describe("resolveNavAccess — role gating", () => {
  it("hides admin-only items from staff", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "staff", plan: "pro" });
    const team = items.find((i) => i.id === "team");
    expect(team?.access).toBe("hidden");
  });

  it("keeps support visible to staff — help is not an owner privilege", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "staff", plan: "free" });
    const support = items.find((i) => i.id === "support");
    expect(support?.access).toBe("open");
  });

  it("treats superadmin as admin for the tenant admin area", () => {
    const items = resolveNavAccess(ADMIN_NAV, {
      role: "superadmin",
      plan: "pro",
    });
    const team = items.find((i) => i.id === "team");
    expect(team?.access).toBe("open");
  });

  it("opens store-plane items for staff", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "staff", plan: "free" });
    const products = items.find((i) => i.id === "products");
    expect(products?.access).toBe("open");
  });
});

// Pages used to compare against the literal "admin", which threw the platform
// owner out of their own store admin the moment they were promoted to
// superadmin — the exact "Access Denied" regression this helper exists to end.
describe("isStoreAdminRole", () => {
  it("accepts admin and superadmin", () => {
    expect(isStoreAdminRole("admin")).toBe(true);
    expect(isStoreAdminRole("superadmin")).toBe(true);
  });

  it("refuses every other role and the signed-out states", () => {
    expect(isStoreAdminRole("staff")).toBe(false);
    expect(isStoreAdminRole("customer")).toBe(false);
    expect(isStoreAdminRole("")).toBe(false);
    expect(isStoreAdminRole(undefined)).toBe(false);
    expect(isStoreAdminRole(null)).toBe(false);
  });
});

describe("resolveNavAccess — plan gating", () => {
  it("locks plan-gated features on a lower plan, naming the required plan for the upsell", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "admin", plan: "free" });
    const insights = items.find((i) => i.id === "insights");
    expect(insights?.access).toBe("locked");
    expect(insights?.requiredPlan).toBe("pro");
  });

  it("locks custom domain below Pro", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "admin", plan: "free" });
    expect(items.find((i) => i.id === "domain")?.access).toBe("locked");
  });

  it("unlocks when the plan is sufficient", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "admin", plan: "pro" });
    expect(items.find((i) => i.id === "insights")?.access).toBe("open");
  });

  it("never locks plan-free items", () => {
    for (const plan of ["free", "pro"] as const) {
      const items = resolveNavAccess(ADMIN_NAV, { role: "admin", plan });
      expect(items.find((i) => i.id === "products")?.access).toBe("open");
      expect(items.find((i) => i.id === "credits")?.access).toBe("open");
    }
  });

  it("role hiding wins over plan locking — staff never sees a locked Team item", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "staff", plan: "free" });
    expect(items.find((i) => i.id === "team")?.access).toBe("hidden");
  });
});

describe("groupNavByPlane", () => {
  it("splits into store and account groups, preserving manifest order", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "admin", plan: "free" });
    const groups = groupNavByPlane(items);
    expect(groups.map((g) => g.plane)).toEqual(["store", "account"]);
    expect(groups[0].items.map((i) => i.id)).toEqual([
      "home",
      "products",
      "import",
      "categories",
      "orders",
      "sales",
      "reconciliation",
      "storefront",
      "testimonials",
      "discounts",
      "domain",
      "channels",
      "pos",
      "till",
      "insights",
    ]);
    expect(groups[1].items[0].id).toBe("account");
  });

  it("drops hidden items but keeps locked ones (shown with an upsell)", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "staff", plan: "free" });
    const groups = groupNavByPlane(items);
    const accountIds = groups[1].items.map((i) => i.id);
    // Staff see their own account and support; billing, team, keys, and the
    // rest of the owner's relationship with Zolto stay hidden.
    expect(accountIds).toEqual(["me", "support"]);
    const storeIds = groups[0].items.map((i) => i.id);
    expect(storeIds).toContain("insights"); // locked, still visible
  });

  it("omits a group entirely when every item is hidden", () => {
    const onlyHidden = resolveNavAccess(
      [
        {
          id: "x",
          plane: "account",
          label: "X",
          icon: "X",
          path: "/admin/x",
          requiredRole: "admin",
        },
      ],
      { role: "staff", plan: "free" },
    );
    expect(groupNavByPlane(onlyHidden)).toEqual([]);
  });
});

// Highlighting used to be `location.startsWith(item.path)`, which lit up every
// ancestor: on /admin/account/team both "Shop profile" and "Team" appeared
// active, and on any /admin/* path so did "Home".
describe("activeNavId", () => {
  it("picks the most specific item, not every ancestor", () => {
    expect(activeNavId(ADMIN_NAV, "/admin/account/team")).toBe("team");
    expect(activeNavId(ADMIN_NAV, "/admin/account/me")).toBe("me");
    expect(activeNavId(ADMIN_NAV, "/admin/account")).toBe("account");
  });

  it("does not leave Home active on every admin page", () => {
    expect(activeNavId(ADMIN_NAV, "/admin")).toBe("home");
    expect(activeNavId(ADMIN_NAV, "/admin/orders")).toBe("orders");
    expect(activeNavId(ADMIN_NAV, "/admin/products/import")).toBe("import");
  });

  it("matches on a path segment boundary, not a string prefix", () => {
    // /admin/ordersomething must not activate /admin/orders.
    expect(activeNavId(ADMIN_NAV, "/admin/ordersomething")).toBe("home");
  });

  it("returns null outside the admin area", () => {
    expect(activeNavId(ADMIN_NAV, "/shop")).toBeNull();
  });
});

describe("My account", () => {
  const me = ADMIN_NAV.find((i) => i.id === "me");

  it("is reachable by any staff member, not just admins", () => {
    // Everyone with a login has a name and a session; gating this at "admin"
    // is what left staff with nowhere to manage their own account.
    expect(me?.requiredRole).toBeUndefined();
    const resolved = resolveNavAccess(ADMIN_NAV, {
      role: "staff",
      plan: "free",
    });
    expect(resolved.find((i) => i.id === "me")?.access).toBe("open");
  });

  it("sits in the account plane, beside the shop's own profile", () => {
    expect(me?.plane).toBe("account");
  });
});
