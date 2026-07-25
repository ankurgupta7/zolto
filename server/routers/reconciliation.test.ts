import { describe, expect, it, vi, beforeEach } from "vitest";
import { NOT_ADMIN_ERR_MSG } from "@shared/const";

const runStripeReconciliation = vi.fn();
const runPosAttribution = vi.fn();

vi.mock("../reconciliation", () => ({
  runStripeReconciliation: (...args: unknown[]) =>
    runStripeReconciliation(...args),
}));

vi.mock("../posAttribution", () => ({
  runPosAttribution: (...args: unknown[]) => runPosAttribution(...args),
}));

import { reconciliationRouter } from "./reconciliation";
import type { TrpcContext } from "../_core/context";

function makeCtx(role: "admin" | "user" | null = null): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null;

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const summary = {
  scannedSucceededPayments: 5,
  alreadyRecorded: 3,
  newPendingReview: 2,
  newNoCandidates: 0,
  emailSent: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconciliation.run", () => {
  it("rejects anonymous callers", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx(null));
    await expect(caller.run({})).rejects.toThrow();
    expect(runStripeReconciliation).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("user"));
    await expect(caller.run({})).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(runStripeReconciliation).not.toHaveBeenCalled();
  });

  it("runs the reconciliation job for an admin and returns its summary", async () => {
    runStripeReconciliation.mockResolvedValue(summary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    const result = await caller.run({ lookbackDays: 14 });

    expect(runStripeReconciliation).toHaveBeenCalledWith(14);
    expect(result).toEqual(summary);
  });

  it("passes undefined lookbackDays through when omitted", async () => {
    runStripeReconciliation.mockResolvedValue(summary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await caller.run({});

    expect(runStripeReconciliation).toHaveBeenCalledWith(undefined);
  });

  it("rejects an out-of-range lookbackDays", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));
    await expect(caller.run({ lookbackDays: 0 })).rejects.toThrow();
    await expect(caller.run({ lookbackDays: 91 })).rejects.toThrow();
  });

  it("maps a not-configured Stripe error to PRECONDITION_FAILED", async () => {
    runStripeReconciliation.mockRejectedValue(
      new Error("Stripe is not configured"),
    );
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await expect(caller.run({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("re-throws unrelated errors unchanged", async () => {
    runStripeReconciliation.mockRejectedValue(new Error("boom"));
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await expect(caller.run({})).rejects.toThrow("boom");
  });
});

const posSummary = {
  scannedLines: 4,
  newPendingReview: 2,
  newNoCandidates: 1,
  emailSent: true,
};

describe("reconciliation.runPos", () => {
  it("rejects anonymous callers", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx(null));
    await expect(caller.runPos({})).rejects.toThrow();
    expect(runPosAttribution).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("user"));
    await expect(caller.runPos({})).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(runPosAttribution).not.toHaveBeenCalled();
  });

  it("runs the POS attribution pass for an admin and returns its summary", async () => {
    runPosAttribution.mockResolvedValue(posSummary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    const result = await caller.runPos({ lookbackDays: 7 });

    expect(runPosAttribution).toHaveBeenCalledWith(7);
    expect(result).toEqual(posSummary);
  });

  it("passes undefined lookbackDays through when omitted", async () => {
    runPosAttribution.mockResolvedValue(posSummary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await caller.runPos({});

    expect(runPosAttribution).toHaveBeenCalledWith(undefined);
  });

  it("rejects an out-of-range lookbackDays", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));
    await expect(caller.runPos({ lookbackDays: 0 })).rejects.toThrow();
    await expect(caller.runPos({ lookbackDays: 31 })).rejects.toThrow();
  });
});
