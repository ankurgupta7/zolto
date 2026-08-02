import { describe, expect, it, vi, beforeEach } from "vitest";

const getUnattributedPosLineItems = vi.fn();
const createPosAttribution = vi.fn();
const findCandidateProducts = vi.fn();
const sendPosAttributionReviewEmail = vi.fn();
const getTenantById = vi.fn();
const getTenantAdminContact = vi.fn();
const getTenantSettings = vi.fn();
let tokenCounter = 0;

vi.mock("./db", () => ({
  getUnattributedPosLineItems: (...a: unknown[]) =>
    getUnattributedPosLineItems(...a),
  createPosAttribution: (...a: unknown[]) => createPosAttribution(...a),
  getTenantById: (...a: unknown[]) => getTenantById(...a),
  getTenantAdminContact: (...a: unknown[]) => getTenantAdminContact(...a),
  getTenantSettings: (...a: unknown[]) => getTenantSettings(...a),
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
  getTenantById.mockImplementation(async (id: number) => ({
    id,
    name: `Store ${id}`,
  }));
  getTenantAdminContact.mockImplementation(async (id: number) => ({
    name: "Anna",
    email: `admin-${id}@example.com`,
  }));
  getTenantSettings.mockResolvedValue(undefined);
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
    // Addressed to the STORE's admin with the store's branding — not the
    // platform operator (which is what a missing `to` would fall back to).
    expect(sendPosAttributionReviewEmail.mock.calls[0][1]).toMatchObject({
      to: "admin-1@example.com",
      tenantName: "Store 1",
    });
  });

  it("sends each store its own email on a platform-wide sweep", async () => {
    getUnattributedPosLineItems.mockResolvedValue([
      line({ tenantId: 1, posOrderItemId: 100, amountRappen: 5000 }),
      line({ tenantId: 2, posOrderItemId: 200, amountRappen: 5000 }),
    ]);
    findCandidateProducts.mockResolvedValue([product(7, "50.00")]);

    const summary = await runPosAttribution(3);

    expect(summary.emailSent).toBe(true);
    expect(sendPosAttributionReviewEmail).toHaveBeenCalledTimes(2);
    const recipients = sendPosAttributionReviewEmail.mock.calls.map(
      (c) => (c[1] as { to?: string }).to,
    );
    expect(recipients.sort()).toEqual([
      "admin-1@example.com",
      "admin-2@example.com",
    ]);
    // Neither email contains the other store's sale.
    for (const [items] of sendPosAttributionReviewEmail.mock.calls) {
      expect(items).toHaveLength(1);
    }
  });

  it("prefers the store's contact email and white-label name when set", async () => {
    getUnattributedPosLineItems.mockResolvedValue([line()]);
    findCandidateProducts.mockResolvedValue([product(7, "50.00")]);
    getTenantSettings.mockResolvedValue({
      whiteLabelName: "Kalakosh",
      publicDomain: "https://kalakosh.ch",
      contactEmail: "hello@kalakosh.ch",
    });

    await runPosAttribution(3);

    expect(sendPosAttributionReviewEmail.mock.calls[0][1]).toMatchObject({
      tenantName: "Kalakosh",
      tenantDomain: "https://kalakosh.ch",
      contactEmail: "hello@kalakosh.ch",
    });
  });

  it("keeps sending to other stores when one store's email fails", async () => {
    getUnattributedPosLineItems.mockResolvedValue([
      line({ tenantId: 1, posOrderItemId: 100 }),
      line({ tenantId: 2, posOrderItemId: 200 }),
    ]);
    findCandidateProducts.mockResolvedValue([product(7, "50.00")]);
    sendPosAttributionReviewEmail
      .mockRejectedValueOnce(new Error("resend down"))
      .mockResolvedValueOnce(undefined);

    const summary = await runPosAttribution(3);

    expect(sendPosAttributionReviewEmail).toHaveBeenCalledTimes(2);
    // Partial delivery is not "sent" — the summary must not claim success.
    expect(summary.emailSent).toBe(false);
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
