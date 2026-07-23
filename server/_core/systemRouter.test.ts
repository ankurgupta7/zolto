import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./context";

const { notifyOwner } = vi.hoisted(() => ({ notifyOwner: vi.fn() }));
vi.mock("./notification", () => ({ notifyOwner }));

import { systemRouter } from "./systemRouter";

function ctx(role: string | null = "admin"): TrpcContext {
  return {
    user: role ? ({ id: 1, role } as never) : null,
    tenant: { id: 7 } as never,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("systemRouter.health", () => {
  it("reports ok for a valid timestamp", async () => {
    const caller = systemRouter.createCaller(ctx(null));
    expect(await caller.health({ timestamp: Date.now() })).toEqual({
      ok: true,
    });
  });

  it("rejects a negative timestamp", async () => {
    const caller = systemRouter.createCaller(ctx(null));
    await expect(caller.health({ timestamp: -1 })).rejects.toThrow();
  });
});

describe("systemRouter.notifyOwner", () => {
  it("forwards the notification and returns delivery status", async () => {
    notifyOwner.mockResolvedValue(true);
    const caller = systemRouter.createCaller(ctx("admin"));
    const res = await caller.notifyOwner({ title: "T", content: "C" });
    expect(res).toEqual({ success: true });
    expect(notifyOwner).toHaveBeenCalledWith({ title: "T", content: "C" });
  });

  it("reports failure when delivery fails", async () => {
    notifyOwner.mockResolvedValue(false);
    const caller = systemRouter.createCaller(ctx("admin"));
    expect(await caller.notifyOwner({ title: "T", content: "C" })).toEqual({
      success: false,
    });
  });

  it("forbids non-admin callers", async () => {
    const caller = systemRouter.createCaller(ctx("user"));
    await expect(
      caller.notifyOwner({ title: "T", content: "C" }),
    ).rejects.toThrow();
  });
});
