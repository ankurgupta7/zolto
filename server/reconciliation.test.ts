import { describe, expect, it, vi, beforeEach } from "vitest";

const getAvailableProductsForMatching = vi.fn();
const getKnownOrderPaymentIntentIds = vi.fn();
const getKnownPosPaymentIntentIds = vi.fn();
const getKnownReconciliationPaymentIntentIds = vi.fn();
const createStripeReconciliation = vi.fn();

vi.mock("./db", () => ({
  getAvailableProductsForMatching: (...args: unknown[]) =>
    getAvailableProductsForMatching(...args),
  getKnownOrderPaymentIntentIds: (...args: unknown[]) =>
    getKnownOrderPaymentIntentIds(...args),
  getKnownPosPaymentIntentIds: (...args: unknown[]) =>
    getKnownPosPaymentIntentIds(...args),
  getKnownReconciliationPaymentIntentIds: (...args: unknown[]) =>
    getKnownReconciliationPaymentIntentIds(...args),
  createStripeReconciliation: (...args: unknown[]) =>
    createStripeReconciliation(...args),
}));

const sendReconciliationReviewEmail = vi.fn();
vi.mock("./_core/email", () => ({
  sendReconciliationReviewEmail: (...args: unknown[]) =>
    sendReconciliationReviewEmail(...args),
}));

const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: (...args: unknown[]) => getStripe(...args),
}));

import {
  findCandidateProducts,
  MAX_CANDIDATES,
  runStripeReconciliation,
} from "./reconciliation";
import type { Product } from "../drizzle/schema";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: "Silver Ring",
    description: "A ring",
    nameEn: null,
    descriptionEn: null,
    price: "100.00",
    category: "Rings",
    imageKey: null,
    imageUrl: null,
    visible: true,
    sold: false,
    quantity: 1,
    source: "manual",
    discordMessageId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makePaymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_1",
    status: "succeeded",
    amount: 10000,
    currency: "chf",
    created: Math.floor(Date.now() / 1000),
    description: null,
    payment_method_types: ["card"],
    ...overrides,
  };
}

// Minimal fake of Stripe's async-iterable list response.
function makeIntentList(intents: unknown[]) {
  return {
    [Symbol.asyncIterator]: () => {
      let i = 0;
      return {
        next: async () =>
          i < intents.length
            ? { value: intents[i++], done: false }
            : { value: undefined, done: true },
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getKnownOrderPaymentIntentIds.mockResolvedValue(new Set());
  getKnownPosPaymentIntentIds.mockResolvedValue(new Set());
  getKnownReconciliationPaymentIntentIds.mockResolvedValue(new Set());
  getAvailableProductsForMatching.mockResolvedValue([]);
  createStripeReconciliation.mockResolvedValue(undefined);
  sendReconciliationReviewEmail.mockResolvedValue(undefined);
});

describe("findCandidateProducts", () => {
  it("ranks products by closeness in price, closest first", async () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({ id: 1, price: "50.00" }),
      makeProduct({ id: 2, price: "98.00" }),
      makeProduct({ id: 3, price: "500.00" }),
    ]);

    const result = await findCandidateProducts(10000); // CHF 100.00
    expect(result.map(p => p.id)).toEqual([2, 1, 3]);
  });

  it("breaks price ties by newest listing first", async () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({ id: 1, price: "100.00", createdAt: new Date("2026-01-01") }),
      makeProduct({ id: 2, price: "100.00", createdAt: new Date("2026-06-01") }),
    ]);

    const result = await findCandidateProducts(10000);
    expect(result.map(p => p.id)).toEqual([2, 1]);
  });

  it("caps results at MAX_CANDIDATES", async () => {
    getAvailableProductsForMatching.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) =>
        makeProduct({ id: i + 1, price: "100.00" })
      )
    );

    const result = await findCandidateProducts(10000);
    expect(result).toHaveLength(MAX_CANDIDATES);
  });

  it("returns an empty list when nothing is in stock", async () => {
    getAvailableProductsForMatching.mockResolvedValue([]);
    expect(await findCandidateProducts(10000)).toEqual([]);
  });
});

describe("runStripeReconciliation", () => {
  it("throws when Stripe is not configured", async () => {
    getStripe.mockReturnValue(null);
    await expect(runStripeReconciliation()).rejects.toThrow(
      "Stripe is not configured"
    );
  });

  it("skips payment intents that are not succeeded", async () => {
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () =>
          makeIntentList([makePaymentIntent({ status: "requires_action" })]),
      },
    });

    const summary = await runStripeReconciliation();
    expect(summary.scannedSucceededPayments).toBe(0);
    expect(createStripeReconciliation).not.toHaveBeenCalled();
  });

  it("counts already-known payment intents without recreating them", async () => {
    getKnownOrderPaymentIntentIds.mockResolvedValue(new Set(["pi_known"]));
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_known" })]),
      },
    });

    const summary = await runStripeReconciliation();
    expect(summary.scannedSucceededPayments).toBe(1);
    expect(summary.alreadyRecorded).toBe(1);
    expect(createStripeReconciliation).not.toHaveBeenCalled();
    expect(sendReconciliationReviewEmail).not.toHaveBeenCalled();
  });

  it("records a pending_review reconciliation with ranked candidates and emails the admin", async () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({ id: 7, price: "100.00" }),
    ]);
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () =>
          makeIntentList([
            makePaymentIntent({ id: "pi_new", amount: 10000 }),
          ]),
      },
    });

    const summary = await runStripeReconciliation();

    expect(createStripeReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "pi_new",
        amountRappen: 10000,
        status: "pending_review",
        candidateProductIds: "7",
      })
    );
    expect(summary.newPendingReview).toBe(1);
    expect(summary.newNoCandidates).toBe(0);
    expect(summary.emailSent).toBe(true);
    expect(sendReconciliationReviewEmail).toHaveBeenCalledWith([
      expect.objectContaining({ paymentIntentId: "pi_new" }),
    ]);
  });

  it("records no_candidates and skips the email when nothing is in stock", async () => {
    getAvailableProductsForMatching.mockResolvedValue([]);
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_new" })]),
      },
    });

    const summary = await runStripeReconciliation();

    expect(createStripeReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ status: "no_candidates", candidateProductIds: "" })
    );
    expect(summary.newNoCandidates).toBe(1);
    expect(summary.newPendingReview).toBe(0);
    expect(sendReconciliationReviewEmail).not.toHaveBeenCalled();
  });

  it("does not fail the run when the review email fails to send", async () => {
    getAvailableProductsForMatching.mockResolvedValue([makeProduct({ id: 7 })]);
    sendReconciliationReviewEmail.mockRejectedValue(new Error("resend down"));
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_new" })]),
      },
    });

    const summary = await runStripeReconciliation();
    expect(summary.emailSent).toBe(false);
    expect(summary.newPendingReview).toBe(1);
  });
});
