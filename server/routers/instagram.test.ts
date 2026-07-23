import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data layer so the router is exercised in isolation.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    getInstagramPosts: vi.fn(),
    addInstagramPost: vi.fn(),
    deleteInstagramPost: vi.fn(),
    reorderInstagramPost: vi.fn(),
  },
}));

vi.mock("../db", () => dbMock);

import { instagramRouter } from "./instagram";
import type { TrpcContext } from "../_core/context";

const TEST_TENANT_ID = 7;

function ctx(
  opts: { role?: "admin" | "user"; tenant?: boolean } = {},
): TrpcContext {
  const { role, tenant = true } = opts;
  return {
    user: role ? ({ id: 1, tenantId: TEST_TENANT_ID, role } as never) : null,
    tenant: tenant ? ({ id: TEST_TENANT_ID } as never) : null,
    req: {} as never,
    res: {} as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getInstagramPosts.mockResolvedValue([]);
});

describe("instagram.list", () => {
  it("scopes the read to the request's tenant", async () => {
    await instagramRouter.createCaller(ctx()).list();
    expect(dbMock.getInstagramPosts).toHaveBeenCalledWith(TEST_TENANT_ID);
  });

  it("throws NOT_FOUND when no tenant is resolved (no cross-tenant leak)", async () => {
    await expect(
      instagramRouter.createCaller(ctx({ tenant: false })).list(),
    ).rejects.toThrow(/not found/i);
    expect(dbMock.getInstagramPosts).not.toHaveBeenCalled();
  });
});

describe("instagram admin mutations", () => {
  it("add scopes to the admin's own tenant", async () => {
    await instagramRouter
      .createCaller(ctx({ role: "admin" }))
      .add({ postUrl: "https://instagram.com/p/abc", sortOrder: 2 });
    expect(dbMock.addInstagramPost).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      "https://instagram.com/p/abc",
      2,
    );
  });

  it("rejects a non-Instagram URL before writing", async () => {
    await expect(
      instagramRouter
        .createCaller(ctx({ role: "admin" }))
        .add({ postUrl: "https://example.com/p/abc", sortOrder: 0 }),
    ).rejects.toThrow(/instagram url/i);
    expect(dbMock.addInstagramPost).not.toHaveBeenCalled();
  });

  it("delete scopes to the admin's own tenant", async () => {
    await instagramRouter
      .createCaller(ctx({ role: "admin" }))
      .delete({ id: 9 });
    expect(dbMock.deleteInstagramPost).toHaveBeenCalledWith(TEST_TENANT_ID, 9);
  });

  it("reorder scopes to the admin's own tenant", async () => {
    await instagramRouter
      .createCaller(ctx({ role: "admin" }))
      .reorder({ id: 9, sortOrder: 3 });
    expect(dbMock.reorderInstagramPost).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      9,
      3,
    );
  });

  it("requires admin for mutations", async () => {
    await expect(
      instagramRouter
        .createCaller(ctx({ role: "user" }))
        .add({ postUrl: "https://instagram.com/p/abc", sortOrder: 0 }),
    ).rejects.toThrow();
    expect(dbMock.addInstagramPost).not.toHaveBeenCalled();
  });
});
