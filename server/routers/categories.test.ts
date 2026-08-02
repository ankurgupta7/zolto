import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantCategory } from "../../drizzle/schema";

const dbMock = vi.hoisted(() => ({
  getTenantCategories: vi.fn(),
  getTenantSettings: vi.fn(),
  createTenantCategoryRow: vi.fn(),
  updateTenantCategoryLabels: vi.fn(),
  renameTenantCategoryKey: vi.fn(),
  deleteTenantCategoryRow: vi.fn(),
  reorderTenantCategories: vi.fn(),
  seedTenantCategories: vi.fn(),
  countProductsInCategory: vi.fn(),
}));

vi.mock("../db", () => dbMock);

import { categoriesRouter } from "./categories";
import type { TrpcContext } from "../_core/context";

const TENANT_A = 7;
const TENANT_B = 8;

function row(
  key: string,
  overrides: Partial<TenantCategory> = {},
): TenantCategory {
  return {
    id: 1,
    tenantId: TENANT_A,
    key,
    labelEn: key,
    labelDe: null,
    extraIncludes: null,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function ctx(opts: {
  role?: "admin" | "customer" | null;
  userTenantId?: number;
  hostTenantId?: number | null;
}): TrpcContext {
  const { role = "admin", userTenantId = TENANT_A, hostTenantId = TENANT_A } =
    opts;
  return {
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
    user:
      role === null
        ? null
        : ({
            id: 1,
            tenantId: userTenantId,
            openId: "u",
            email: "a@b.c",
            name: "U",
            role,
          } as never),
    tenant:
      hostTenantId === null
        ? null
        : ({ id: hostTenantId, slug: `store-${hostTenantId}` } as never),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getTenantCategories.mockResolvedValue([
    row("Bowls"),
    row("Vases", { extraIncludes: ["Bowls"] }),
    row("Other"),
  ]);
  dbMock.getTenantSettings.mockResolvedValue({
    vertical: "ceramics",
    verticalDescription: null,
  });
  dbMock.countProductsInCategory.mockResolvedValue(0);
});

describe("categories.list", () => {
  it("returns the host store's categories, public", async () => {
    const res = await categoriesRouter
      .createCaller(ctx({ role: null }))
      .list();
    expect(res.map((c) => c.key)).toEqual(["Bowls", "Vases", "Other"]);
    expect(res[1].extraIncludes).toEqual(["Bowls"]);
    expect(dbMock.getTenantCategories).toHaveBeenCalledWith(TENANT_A);
  });

  it("404s with no store host", async () => {
    await expect(
      categoriesRouter.createCaller(ctx({ role: null, hostTenantId: null })).list(),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("categories mutations — authorization", () => {
  it("refuses an anonymous caller", async () => {
    await expect(
      categoriesRouter.createCaller(ctx({ role: null })).create({ key: "X" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a signed-in non-admin", async () => {
    await expect(
      categoriesRouter
        .createCaller(ctx({ role: "customer" }))
        .create({ key: "X" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an admin of a DIFFERENT tenant addressing this store", async () => {
    // Admin of store B pointing at store A's host: adminProcedure alone would
    // pass this; tenantAdminProcedure must not.
    await expect(
      categoriesRouter
        .createCaller(
          ctx({ role: "admin", userTenantId: TENANT_B, hostTenantId: TENANT_A }),
        )
        .create({ key: "X" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.createTenantCategoryRow).not.toHaveBeenCalled();
  });
});

describe("categories.create", () => {
  it("adds a category, defaulting labelEn to the key", async () => {
    await categoriesRouter.createCaller(ctx({})).create({ key: "Planters" });
    expect(dbMock.createTenantCategoryRow).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      key: "Planters",
      labelEn: "Planters",
      labelDe: null,
    });
  });

  it("rejects a duplicate key", async () => {
    await expect(
      categoriesRouter.createCaller(ctx({})).create({ key: "Bowls" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects keys with characters that would break prompts or URLs", async () => {
    await expect(
      categoriesRouter.createCaller(ctx({})).create({ key: 'Bad"Key' }),
    ).rejects.toThrow();
    await expect(
      categoriesRouter.createCaller(ctx({})).create({ key: " leading" }),
    ).resolves.toBeTruthy(); // trimmed to "leading" — valid
  });
});

describe("categories.update", () => {
  it("renames a key via the cascading helper", async () => {
    await categoriesRouter
      .createCaller(ctx({}))
      .update({ key: "Bowls", newKey: "Serving Bowls" });
    expect(dbMock.renameTenantCategoryKey).toHaveBeenCalledWith(
      TENANT_A,
      "Bowls",
      "Serving Bowls",
    );
  });

  it("updates labels on the (possibly renamed) key", async () => {
    await categoriesRouter
      .createCaller(ctx({}))
      .update({ key: "Bowls", newKey: "Serving Bowls", labelDe: "Schalen" });
    expect(dbMock.updateTenantCategoryLabels).toHaveBeenCalledWith(
      TENANT_A,
      "Serving Bowls",
      { labelDe: "Schalen" },
    );
  });

  it("refuses to rename the Other fallback", async () => {
    await expect(
      categoriesRouter
        .createCaller(ctx({}))
        .update({ key: "Other", newKey: "Misc" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses renaming onto an existing key", async () => {
    await expect(
      categoriesRouter
        .createCaller(ctx({}))
        .update({ key: "Bowls", newKey: "Vases" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("404s on a key the tenant does not have", async () => {
    await expect(
      categoriesRouter
        .createCaller(ctx({}))
        .update({ key: "Necklaces", labelEn: "X" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("categories.remove", () => {
  it("refuses to delete the Other fallback", async () => {
    await expect(
      categoriesRouter.createCaller(ctx({})).remove({ key: "Other" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deletes an empty category without needing reassignTo", async () => {
    const res = await categoriesRouter
      .createCaller(ctx({}))
      .remove({ key: "Bowls" });
    expect(res.reassigned).toBe(0);
    expect(dbMock.deleteTenantCategoryRow).toHaveBeenCalledWith(
      TENANT_A,
      "Bowls",
      "Other",
    );
  });

  it("requires reassignTo when products exist, then reassigns", async () => {
    dbMock.countProductsInCategory.mockResolvedValue(3);
    await expect(
      categoriesRouter.createCaller(ctx({})).remove({ key: "Bowls" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const res = await categoriesRouter
      .createCaller(ctx({}))
      .remove({ key: "Bowls", reassignTo: "Vases" });
    expect(res.reassigned).toBe(3);
    expect(dbMock.deleteTenantCategoryRow).toHaveBeenCalledWith(
      TENANT_A,
      "Bowls",
      "Vases",
    );
  });

  it("rejects reassigning to a category the tenant does not have", async () => {
    dbMock.countProductsInCategory.mockResolvedValue(1);
    await expect(
      categoriesRouter
        .createCaller(ctx({}))
        .remove({ key: "Bowls", reassignTo: "Necklaces" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("categories.reorder", () => {
  it("applies a full ordering", async () => {
    await categoriesRouter
      .createCaller(ctx({}))
      .reorder({ keys: ["Vases", "Bowls", "Other"] });
    expect(dbMock.reorderTenantCategories).toHaveBeenCalledWith(TENANT_A, [
      "Vases",
      "Bowls",
      "Other",
    ]);
  });

  it("rejects unknown keys", async () => {
    await expect(
      categoriesRouter.createCaller(ctx({})).reorder({ keys: ["Rings"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("categories.applyPreset", () => {
  it("re-seeds the tenant's current vertical preset", async () => {
    const res = await categoriesRouter.createCaller(ctx({})).applyPreset();
    expect(res.vertical).toBe("ceramics");
    expect(dbMock.seedTenantCategories).toHaveBeenCalledWith(
      TENANT_A,
      "ceramics",
    );
    expect(res.preset).toContain("Mugs & Cups");
  });
});
