import { describe, expect, it, vi, beforeEach } from "vitest";
import { NOT_ADMIN_ERR_MSG } from "@shared/const";

const runStripeReconciliationForTenant = vi.fn();
const runPosAttribution = vi.fn();

// NotConnectedError has to be a real class the router can `instanceof`
// against — that branch turns "this store never linked Stripe" into a
// readable PRECONDITION_FAILED instead of a 500. Declared via vi.hoisted
// because vi.mock's factory is lifted above ordinary top-level declarations.
const { NotConnectedError } = vi.hoisted(() => ({
  NotConnectedError: class NotConnectedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NotConnectedError";
    }
  },
}));

vi.mock("../reconciliation", () => ({
  runStripeReconciliationForTenant: (...args: unknown[]) =>
    runStripeReconciliationForTenant(...args),
  NotConnectedError,
}));

vi.mock("../posAttribution", () => ({
  runPosAttribution: (...args: unknown[]) => runPosAttribution(...args),
}));

const listPendingReview = vi.fn();
const resolvePendingStripe = vi.fn();
const resolvePendingPos = vi.fn();

// PendingResolveError has to be a real class the router can `instanceof`
// against — that branch is what turns a refusal into the right tRPC code
// instead of a 500. Hoisted for the same reason NotConnectedError is.
const { PendingResolveError } = vi.hoisted(() => ({
  PendingResolveError: class PendingResolveError extends Error {
    constructor(
      readonly reason: string,
      message: string,
    ) {
      super(message);
      this.name = "PendingResolveError";
    }
  },
}));

vi.mock("../pendingReview", () => ({
  listPendingReview: (...args: unknown[]) => listPendingReview(...args),
  resolvePendingStripe: (...args: unknown[]) => resolvePendingStripe(...args),
  resolvePendingPos: (...args: unknown[]) => resolvePendingPos(...args),
  PendingResolveError,
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
    expect(runStripeReconciliationForTenant).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("user"));
    await expect(caller.run({})).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(runStripeReconciliationForTenant).not.toHaveBeenCalled();
  });

  it("scans the CALLER'S store, not the platform account", async () => {
    runStripeReconciliationForTenant.mockResolvedValue(summary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    const result = await caller.run({ lookbackDays: 14 });

    // First argument is the tenant whose connected account gets read.
    expect(runStripeReconciliationForTenant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      14,
    );
    expect(result).toEqual(summary);
  });

  it("passes undefined lookbackDays through when omitted", async () => {
    runStripeReconciliationForTenant.mockResolvedValue(summary);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await caller.run({});

    expect(runStripeReconciliationForTenant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      undefined,
    );
  });

  it("refuses an admin of a different store", async () => {
    // Reading another merchant's Stripe payments is the exact leak the
    // per-tenant rework had to avoid introducing.
    const caller = reconciliationRouter.createCaller(makeCtx("admin", 7, 42));
    await expect(caller.run({})).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(runStripeReconciliationForTenant).not.toHaveBeenCalled();
  });

  it("turns a never-connected store into a readable precondition failure", async () => {
    runStripeReconciliationForTenant.mockRejectedValue(
      new NotConnectedError("This store hasn't connected a Stripe account yet"),
    );
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));
    // An in-person-only merchant is a normal state, not a server fault.
    await expect(caller.run({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("rejects an out-of-range lookbackDays", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));
    await expect(caller.run({ lookbackDays: 0 })).rejects.toThrow();
    await expect(caller.run({ lookbackDays: 91 })).rejects.toThrow();
  });

  it("maps a not-configured Stripe error to PRECONDITION_FAILED", async () => {
    runStripeReconciliationForTenant.mockRejectedValue(
      new Error("Stripe is not configured"),
    );
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await expect(caller.run({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("re-throws unrelated errors unchanged", async () => {
    runStripeReconciliationForTenant.mockRejectedValue(new Error("boom"));
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

// The durable path: what is still outstanding, and clearing it from the
// console with the admin's own session rather than a mailed bearer token.
describe("reconciliation.listPending", () => {
  const queue = { stripe: [], pos: [] };

  it("rejects anonymous callers", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx(null));
    await expect(caller.listPending()).rejects.toThrow();
    expect(listPendingReview).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("user"));
    await expect(caller.listPending()).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(listPendingReview).not.toHaveBeenCalled();
  });

  it("lists the CALLER'S store's queue", async () => {
    listPendingReview.mockResolvedValue(queue);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    expect(await caller.listPending()).toEqual(queue);
    expect(listPendingReview).toHaveBeenCalledWith(42);
  });

  it("refuses an admin of a different store", async () => {
    // The queue names unmatched payments and their amounts — another
    // merchant's trading, item by item.
    const caller = reconciliationRouter.createCaller(makeCtx("admin", 7, 42));
    await expect(caller.listPending()).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(listPendingReview).not.toHaveBeenCalled();
  });
});

describe("reconciliation.resolveStripe / resolvePos", () => {
  const applied = { productName: "Silver Ring", amountRappen: 10000 };

  it("applies the decision against the caller's own store", async () => {
    resolvePendingStripe.mockResolvedValue(applied);
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    expect(await caller.resolveStripe({ id: 3, productId: 7 })).toEqual(
      applied,
    );
    expect(resolvePendingStripe).toHaveBeenCalledWith(42, 3, 7);
  });

  it("passes a null productId through as 'none of these'", async () => {
    resolvePendingPos.mockResolvedValue({
      productName: null,
      amountRappen: 4500,
    });
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await caller.resolvePos({ id: 5, productId: null });
    expect(resolvePendingPos).toHaveBeenCalledWith(42, 5, null);
  });

  // This decision decrements stock, so the cross-tenant guard matters more
  // here than on any read: an admin of store A must not be able to mark store
  // B's piece sold by guessing a row id.
  it("refuses an admin of a different store", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("admin", 7, 42));
    await expect(caller.resolveStripe({ id: 3, productId: 7 })).rejects.toThrow(
      NOT_ADMIN_ERR_MSG,
    );
    await expect(caller.resolvePos({ id: 5, productId: 7 })).rejects.toThrow(
      NOT_ADMIN_ERR_MSG,
    );
    expect(resolvePendingStripe).not.toHaveBeenCalled();
    expect(resolvePendingPos).not.toHaveBeenCalled();
  });

  it("maps a missing or other-store row to NOT_FOUND", async () => {
    resolvePendingStripe.mockRejectedValue(
      new PendingResolveError("not_found", "no longer in your review queue"),
    );
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await expect(
      caller.resolveStripe({ id: 3, productId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps an already-decided row to CONFLICT", async () => {
    resolvePendingStripe.mockRejectedValue(
      new PendingResolveError("already_handled", "already reviewed"),
    );
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await expect(
      caller.resolveStripe({ id: 3, productId: 7 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps a piece outside the shortlist to BAD_REQUEST", async () => {
    resolvePendingPos.mockRejectedValue(
      new PendingResolveError("not_a_candidate", "not one of the candidates"),
    );
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));

    await expect(
      caller.resolvePos({ id: 5, productId: 99 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a malformed id", async () => {
    const caller = reconciliationRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.resolveStripe({ id: 0, productId: 7 }),
    ).rejects.toThrow();
    expect(resolvePendingStripe).not.toHaveBeenCalled();
  });
});
