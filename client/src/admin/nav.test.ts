import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  groupNavByPlane,
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
    const items = resolveNavAccess(ADMIN_NAV, { role: "superadmin", plan: "pro" });
    const team = items.find((i) => i.id === "team");
    expect(team?.access).toBe("open");
  });

  it("opens store-plane items for staff", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "staff", plan: "free" });
    const products = items.find((i) => i.id === "products");
    expect(products?.access).toBe("open");
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
      "home", "products", "import", "orders", "reconciliation",
      "storefront", "domain", "channels", "pos", "insights",
    ]);
    expect(groups[1].items[0].id).toBe("account");
  });

  it("drops hidden items but keeps locked ones (shown with an upsell)", () => {
    const items = resolveNavAccess(ADMIN_NAV, { role: "staff", plan: "free" });
    const groups = groupNavByPlane(items);
    const accountIds = groups[1].items.map((i) => i.id);
    expect(accountIds).toEqual(["support"]); // everything else hidden for staff
    const storeIds = groups[0].items.map((i) => i.id);
    expect(storeIds).toContain("insights"); // locked, still visible
  });

  it("omits a group entirely when every item is hidden", () => {
    const onlyHidden = resolveNavAccess(
      [{ id: "x", plane: "account", label: "X", icon: "X", path: "/admin/x", requiredRole: "admin" }],
      { role: "staff", plan: "free" },
    );
    expect(groupNavByPlane(onlyHidden)).toEqual([]);
  });
});
