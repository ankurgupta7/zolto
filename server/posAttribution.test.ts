import { describe, expect, it, vi, beforeEach } from "vitest";

const getUnattributedPosLineItems = vi.fn();
const createPosAttribution = vi.fn();
const findCandidateProducts = vi.fn();
const sendPosAttributionReviewEmail = vi.fn();
let tokenCounter = 0;

vi.mock("./db", () => ({
  getUnattributedPosLineItems: (...a: unknown[]) =>
    getUnattributedPosLineItems(...a),
  createPosAttribution: (...a: unknown[]) => createPosAttribution(...a),
}));

vi.mock("./reconciliation", () => ({
  findCandidateProducts: (...a: unknown[]) => findCandidateProducts(...a),
  generateConfirmationToken: () => `tok_${++tokenCounter}`,
}));

vi.mock("./_core/email", () => ({
  sendPosAttributionReviewEmail: (...a: unknown[]) =>
    sendPosAttributionReviewEmail(...a),
}));

import { runPosAttribution } from "./posAttribution";

function line(over: Partial<Record<string, unknown>> = {}) {
  return {
    tenantId: 1,
    posOrderId: 10,
    posOrderItemId: 100,
    amountRappen: 5000,
    name: "Custom",
    createdAt: new Date("2026-07-20T17:00:00Z"),
    ...over,
  };
}

function product(id: number, price: string) {
  return { id, name: `P${id}`, nameEn: null, price };
}

beforeEach(() => {
  vi.clearAllMocks();
  tokenCounter = 0;
});

describe("runPosAttribution", () => {
  it("returns an empty summary and sends no email when nothing is unattributed", async () => {
    getUnattributedPosLineItems.mockResolvedValue([]);

    const summary = await runPosAttribution(3);

    expect(summary).toEqual({
      scannedLines: 0,
      newPendingReview: 0,
      newNoCandidates: 0,
      emailSent: false,
    });
    expect(createPosAttribution).not.toHaveBeenCalled();
    expect(sendPosAttributionReviewEmail).not.toHaveBeenCalled();
  });

  it("matches candidates against each line's own tenant (per-tenant)", async () => {
    getUnattributedPosLineItems.mockResolvedValue([
      line({ tenantId: 1, posOrderItemId: 100, amountRappen: 5000 }),
      line({ tenantId: 2, posOrderItemId: 200, amountRappen: 8000 }),
    ]);
    findCandidateProducts.mockResolvedValue([product(7, "50.00")]);

    await runPosAttribution(3);

    expect(findCandidateProducts).toHaveBeenCalledWith(1, 5000);
    expect(findCandidateProducts).toHaveBeenCalledWith(2, 8000);
  });

  it("queues a pending_review row and emails when a candidate is found", async () => {
    getUnattributedPosLineItems.mockResolvedValue([line()]);
    findCandidateProducts.mockResolvedValue([
      product(7, "50.00"),
      product(8, "48.00"),
    ]);

    const summary = await runPosAttribution(3);

    expect(createPosAttribution).toHaveBeenCalledWith({
      tenantId: 1,
      posOrderId: 10,
      posOrderItemId: 100,
      amountRappen: 5000,
      status: "pending_review",
      candidateProductIds: "7,8",
      confirmationToken: "tok_1",
    });
    expect(summary.newPendingReview).toBe(1);
    expect(summary.newNoCandidates).toBe(0);
    expect(summary.emailSent).toBe(true);

    const emailArg = sendPosAttributionReviewEmail.mock.calls[0][0];
    expect(emailArg).toHaveLength(1);
    expect(emailArg[0]).toMatchObject({
      posOrderItemId: 100,
      amountRappen: 5000,
      itemLabel: "Custom",
      token: "tok_1",
    });
    expect(emailArg[0].candidates.map((c: { id: number }) => c.id)).toEqual([
      7, 8,
    ]);
  });

  it("records no_candidates (no email) when nothing matches on price", async () => {
    getUnattributedPosLineItems.mockResolvedValue([line()]);
    findCandidateProducts.mockResolvedValue([]);

    const summary = await runPosAttribution(3);

    expect(createPosAttribution).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "no_candidates",
        candidateProductIds: "",
      }),
    );
    expect(summary.newNoCandidates).toBe(1);
    expect(summary.newPendingReview).toBe(0);
    expect(summary.emailSent).toBe(false);
    expect(sendPosAttributionReviewEmail).not.toHaveBeenCalled();
  });

  it("still records rows if the review email fails to send", async () => {
    getUnattributedPosLineItems.mockResolvedValue([line()]);
    findCandidateProducts.mockResolvedValue([product(7, "50.00")]);
    sendPosAttributionReviewEmail.mockRejectedValue(new Error("resend down"));

    const summary = await runPosAttribution(3);

    expect(createPosAttribution).toHaveBeenCalledTimes(1);
    expect(summary.newPendingReview).toBe(1);
    expect(summary.emailSent).toBe(false);
  });

  it("looks back the requested number of days", async () => {
    getUnattributedPosLineItems.mockResolvedValue([]);
    const before = Date.now();

    await runPosAttribution(5);

    const since = getUnattributedPosLineItems.mock.calls[0][0] as Date;
    const expectedMs = 5 * 86400 * 1000;
    // since ≈ now - 5 days, allow a small window for execution time.
    expect(before - since.getTime()).toBeGreaterThanOrEqual(expectedMs - 5000);
    expect(before - since.getTime()).toBeLessThanOrEqual(expectedMs + 5000);
  });
});
