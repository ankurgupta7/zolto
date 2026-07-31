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

function makeCtx(
  role: "admin" | "user" | null = null,
  // runPos is tenant-scoped, so a context needs both a user and the store
  // being addressed. They match by default; pass different ids to exercise
  // the cross-tenant guard.
  userTenantId = 42,
  hostTenantId: number | null = 42,
): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus",
          role,
          tenantId: userTenantId,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null;

  return {
    user,
    tenant:
      hostTenantId === null
        ? null
        : ({ id: hostTenantId, slug: "aurora", plan: "free" } as never),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
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

  // Deliberately NOT tenant-scoped, unlike runPos: this scans the platform's
  // own Stripe account and matches against DEFAULT_TENANT_ID. Pinned so the
  // asymmetry is a recorded decision rather than a missed route — see the
  // comment on `run` in reconciliation.ts for what still needs deciding.
  it("still runs for an admin of another store (platform-scoped by design)", async () => {
    runStripeReconciliation.mockResolvedValue(summary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin", 7, 42));
    await expect(caller.run({})).resolves.toEqual(summary);
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

    // Second arg is the caller's OWN tenant — the scan must not sweep others.
    expect(runPosAttribution).toHaveBeenCalledWith(7, 42);
    expect(result).toEqual(posSummary);
  });

  it("passes undefined lookbackDays through when omitted", async () => {
    runPosAttribution.mockResolvedValue(posSummary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await caller.runPos({});

    expect(runPosAttribution).toHaveBeenCalledWith(undefined, 42);
  });

  // Regression: runPos previously swept EVERY tenant's unattributed POS lines,
  // so one merchant pressing "Scan" wrote pos_attributions rows for every other
  // store and folded their volume into the counts it returned.
  it("refuses an admin of a different store", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("admin", 7, 42));
    await expect(caller.runPos({})).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(runPosAttribution).not.toHaveBeenCalled();
  });

  it("refuses when no store is addressed", async () => {
    const caller = reconciliationRouter.createCaller(
      makeCtx("admin", 42, null),
    );
    await expect(caller.runPos({})).rejects.toThrow();
    expect(runPosAttribution).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range lookbackDays", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));
    await expect(caller.runPos({ lookbackDays: 0 })).rejects.toThrow();
    await expect(caller.runPos({ lookbackDays: 31 })).rejects.toThrow();
  });
});
