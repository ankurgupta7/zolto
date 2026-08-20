import { describe, expect, it, vi, beforeEach } from "vitest";

const getAvailableProductsForMatching = vi.fn();
const getKnownOrderPaymentIntentIds = vi.fn();
const getKnownPosPaymentIntentIds = vi.fn();
const getKnownReconciliationPaymentIntentIds = vi.fn();
const createStripeReconciliation = vi.fn();
const getTenantsWithConnectedStripe = vi.fn();
const getTenantAdminContact = vi.fn();
const getTenantSettings = vi.fn();
const getPendingStripeReconciliations = vi.fn();
const getProductsByIds = vi.fn();
const extendReviewTokenExpiry = vi.fn();

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
  getTenantsWithConnectedStripe: (...args: unknown[]) =>
    getTenantsWithConnectedStripe(...args),
  getTenantAdminContact: (...args: unknown[]) => getTenantAdminContact(...args),
  getTenantSettings: (...args: unknown[]) => getTenantSettings(...args),
  getPendingStripeReconciliations: (...args: unknown[]) =>
    getPendingStripeReconciliations(...args),
  getProductsByIds: (...args: unknown[]) => getProductsByIds(...args),
  extendReviewTokenExpiry: (...args: unknown[]) =>
    extendReviewTokenExpiry(...args),
}));

const sendReconciliationReviewEmail = vi.fn();
const buildReconciliationReviewHtml = vi.fn(() => "<html>review</html>");
vi.mock("./_core/email", () => ({
  sendReconciliationReviewEmail: (...args: unknown[]) =>
    sendReconciliationReviewEmail(...args),
  buildReconciliationReviewHtml: (...args: unknown[]) =>
    buildReconciliationReviewHtml(...args),
}));

const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: (...args: unknown[]) => getStripe(...args),
}));

import {
  findCandidateProducts,
  MAX_CANDIDATES,
  NotConnectedError,
  runStripeReconciliationForAllTenants,
  runStripeReconciliationForTenant,
  toBaseUrl,
} from "./reconciliation";

const TENANT = {
  id: 42,
  name: "Aurora",
  slug: "aurora",
  stripeConnectedAccountId: "acct_aurora",
};

/** Shorthand so the existing bodies read the same as before the rework. */
const runStripeReconciliation = (lookbackDays?: number) =>
  runStripeReconciliationForTenant(TENANT, lookbackDays);
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
  getPendingStripeReconciliations.mockResolvedValue([]);
  getProductsByIds.mockResolvedValue([]);
  extendReviewTokenExpiry.mockResolvedValue(undefined);
  sendReconciliationReviewEmail.mockResolvedValue({ sent: true });
  buildReconciliationReviewHtml.mockReturnValue("<html>review</html>");
  getTenantsWithConnectedStripe.mockResolvedValue([]);
  getTenantAdminContact.mockResolvedValue({
    name: "Owner",
    email: "owner@aurora.example",
  });
  getTenantSettings.mockResolvedValue(null);
});

describe("findCandidateProducts", () => {
  it("ranks products by closeness in price, closest first", async () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({ id: 1, price: "50.00" }),
      makeProduct({ id: 2, price: "98.00" }),
      makeProduct({ id: 3, price: "500.00" }),
    ]);

    const result = await findCandidateProducts(1, 10000); // CHF 100.00
    expect(result.map((p) => p.id)).toEqual([2, 1, 3]);
  });

  it("breaks price ties by newest listing first", async () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({
        id: 1,
        price: "100.00",
        createdAt: new Date("2026-01-01"),
      }),
      makeProduct({
        id: 2,
        price: "100.00",
        createdAt: new Date("2026-06-01"),
      }),
    ]);

    const result = await findCandidateProducts(1, 10000);
    expect(result.map((p) => p.id)).toEqual([2, 1]);
  });

  it("caps results at MAX_CANDIDATES", async () => {
    getAvailableProductsForMatching.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) =>
        makeProduct({ id: i + 1, price: "100.00" }),
      ),
    );

    const result = await findCandidateProducts(1, 10000);
    expect(result).toHaveLength(MAX_CANDIDATES);
  });

  it("returns an empty list when nothing is in stock", async () => {
    getAvailableProductsForMatching.mockResolvedValue([]);
    expect(await findCandidateProducts(1, 10000)).toEqual([]);
  });
});

describe("runStripeReconciliation", () => {
  it("throws when Stripe is not configured", async () => {
    getStripe.mockReturnValue(null);
    await expect(runStripeReconciliation()).rejects.toThrow(
      "Stripe is not configured",
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
          makeIntentList([makePaymentIntent({ id: "pi_new", amount: 10000 })]),
      },
    });

    const summary = await runStripeReconciliation();

    expect(createStripeReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "pi_new",
        amountRappen: 10000,
        status: "pending_review",
        candidateProductIds: "7",
      }),
    );
    expect(summary.newPendingReview).toBe(1);
    expect(summary.newNoCandidates).toBe(0);
    expect(summary.emailSent).toBe(true);
    expect(sendReconciliationReviewEmail).toHaveBeenCalledWith(
      [expect.objectContaining({ paymentIntentId: "pi_new" })],
      expect.objectContaining({ to: "owner@aurora.example" }),
    );
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
      expect.objectContaining({
        status: "no_candidates",
        candidateProductIds: "",
      }),
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

// The button used to be a one-shot: a run that detected payments but could not
// deliver its email filed the rows anyway, and every later run saw those rows
// in `getKnownReconciliationPaymentIntentIds`, counted them as already
// recorded, and reported "nothing to reconcile" — with the merchant never
// asked, and no way to ask again.
describe("re-running with work still outstanding", () => {
  function makePendingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      tenantId: TENANT.id,
      stripePaymentIntentId: "pi_old",
      amountRappen: 9800,
      currency: "chf",
      stripeCreatedAt: new Date("2026-02-01T10:00:00Z"),
      description: null,
      paymentMethodType: "card",
      status: "pending_review",
      candidateProductIds: "7,8",
      chosenProductId: null,
      confirmationToken: "tok_old",
      resolvedAt: null,
      createdAt: new Date("2026-02-01T10:00:00Z"),
      updatedAt: new Date("2026-02-01T10:00:00Z"),
      ...overrides,
    };
  }

  const emptyScan = () => ({
    paymentIntents: { list: () => makeIntentList([]) },
  });

  it("re-sends payments an earlier run left unconfirmed, even with nothing new", async () => {
    getPendingStripeReconciliations.mockResolvedValue([makePendingRow()]);
    getProductsByIds.mockResolvedValue([
      makeProduct({ id: 7, name: "Ring", price: "98.00" }),
      makeProduct({ id: 8, name: "Cuff", price: "95.00" }),
    ]);
    getStripe.mockReturnValue(emptyScan());

    const summary = await runStripeReconciliation();

    expect(summary.newPendingReview).toBe(0);
    expect(summary.stillPendingReview).toBe(1);
    expect(summary.totalPendingReview).toBe(1);
    expect(sendReconciliationReviewEmail).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          paymentIntentId: "pi_old",
          // The original row's token, so the links in the first email and this
          // one point at the same decision.
          token: "tok_old",
        }),
      ],
      expect.anything(),
    );
  });

  it("restarts the link's clock for everything it re-sends", async () => {
    // Without this, a re-sent email carries a link dated from the day the
    // payment was first detected — which for an old backlog item is already
    // dead on arrival.
    getPendingStripeReconciliations.mockResolvedValue([makePendingRow()]);
    getProductsByIds.mockResolvedValue([makeProduct({ id: 7 })]);
    getStripe.mockReturnValue(emptyScan());

    await runStripeReconciliation();

    const [table, tenantId, ids, expiresAt] =
      extendReviewTokenExpiry.mock.calls[0];
    expect(table).toBe("stripe_reconciliations");
    expect(tenantId).toBe(TENANT.id);
    expect(ids).toEqual([1]);
    expect((expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not re-send a row decided between the two queries", async () => {
    // getPendingStripeReconciliations read it as pending, but the decision
    // that landed in between cleared its token — there is nothing to mail.
    getPendingStripeReconciliations.mockResolvedValue([
      makePendingRow({ confirmationToken: null }),
    ]);
    getProductsByIds.mockResolvedValue([makeProduct({ id: 7 })]);
    getStripe.mockReturnValue(emptyScan());

    const summary = await runStripeReconciliation();
    expect(summary.totalPendingReview).toBe(0);
    expect(sendReconciliationReviewEmail).not.toHaveBeenCalled();
  });

  it("keeps a candidate's stored position when an earlier candidate was deleted", async () => {
    // The confirm route resolves `choice` by indexing into the row's stored
    // candidateProductIds, so re-numbering the survivors would assign the
    // payment to the wrong piece.
    getPendingStripeReconciliations.mockResolvedValue([
      makePendingRow({ candidateProductIds: "7,8,9" }),
    ]);
    getProductsByIds.mockResolvedValue([makeProduct({ id: 9, name: "Pin" })]);
    getStripe.mockReturnValue(emptyScan());

    await runStripeReconciliation();

    const [items] = sendReconciliationReviewEmail.mock.calls[0];
    expect(items[0].candidates).toEqual([
      expect.objectContaining({ id: 9, choiceIndex: 2 }),
    ]);
  });

  it("drops a still-pending payment whose candidate pieces have all gone", async () => {
    getPendingStripeReconciliations.mockResolvedValue([makePendingRow()]);
    getProductsByIds.mockResolvedValue([]);
    getStripe.mockReturnValue(emptyScan());

    const summary = await runStripeReconciliation();
    expect(summary.totalPendingReview).toBe(0);
    expect(sendReconciliationReviewEmail).not.toHaveBeenCalled();
  });

  it("does not list a payment twice when this run just created it", async () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({ id: 7, price: "100.00" }),
    ]);
    getPendingStripeReconciliations.mockResolvedValue([
      makePendingRow({ stripePaymentIntentId: "pi_new" }),
    ]);
    getProductsByIds.mockResolvedValue([makeProduct({ id: 7 })]);
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_new" })]),
      },
    });

    const summary = await runStripeReconciliation();

    expect(summary.totalPendingReview).toBe(1);
    expect(summary.stillPendingReview).toBe(0);
    const [items] = sendReconciliationReviewEmail.mock.calls[0];
    expect(items).toHaveLength(1);
  });
});

// A send that never happened must not read as one — and whatever the merchant
// was supposed to receive has to reach them some other way.
describe("when the review email does not go out", () => {
  const oneUnmatchedPayment = () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({ id: 7, price: "100.00" }),
    ]);
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_new" })]),
      },
    });
  };

  it("reports the reason when email is not configured, and returns the review page", async () => {
    oneUnmatchedPayment();
    sendReconciliationReviewEmail.mockResolvedValue({
      sent: false,
      reason: "RESEND_API_KEY is not set on this server",
    });

    const summary = await runStripeReconciliation();

    expect(summary.emailSent).toBe(false);
    expect(summary.emailError).toMatch(/RESEND_API_KEY/);
    expect(summary.reviewHtml).toBe("<html>review</html>");
    // Built from the same items and branding the email would have carried, so
    // the tokens in the page are the live ones.
    expect(buildReconciliationReviewHtml).toHaveBeenCalledWith(
      [expect.objectContaining({ paymentIntentId: "pi_new" })],
      expect.objectContaining({ tenantName: "Aurora" }),
    );
  });

  it("returns the review page when Resend rejects the send", async () => {
    oneUnmatchedPayment();
    sendReconciliationReviewEmail.mockRejectedValue(
      new Error("Resend API 422: bad"),
    );

    const summary = await runStripeReconciliation();
    expect(summary.emailError).toMatch(/Resend API 422/);
    expect(summary.reviewHtml).toBe("<html>review</html>");
  });

  it("returns no review page when the email was delivered", async () => {
    oneUnmatchedPayment();
    sendReconciliationReviewEmail.mockResolvedValue({ sent: true });

    const summary = await runStripeReconciliation();
    expect(summary.emailSent).toBe(true);
    expect(summary.emailError).toBeNull();
    expect(summary.reviewHtml).toBeNull();
    expect(buildReconciliationReviewHtml).not.toHaveBeenCalled();
  });

  it("leaves a clean scan with nothing to render", async () => {
    getStripe.mockReturnValue({
      paymentIntents: { list: () => makeIntentList([]) },
    });

    const summary = await runStripeReconciliation();
    expect(summary.totalPendingReview).toBe(0);
    expect(summary.reviewHtml).toBeNull();
    expect(summary.emailError).toBeNull();
  });
});

describe("toBaseUrl", () => {
  it("adds a scheme to a bare stored domain", () => {
    // tenant_settings.publicDomain is stored bare; without this the confirm
    // links are relative and resolve against whatever page shows them.
    expect(toBaseUrl("aurora.example")).toBe("https://aurora.example");
  });

  it("leaves an absolute URL alone and trims a trailing slash", () => {
    expect(toBaseUrl("https://aurora.example/")).toBe("https://aurora.example");
    expect(toBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

// The whole point of the rework: read the MERCHANT's account, match against
// the MERCHANT's catalogue, file the row against the MERCHANT's tenant.
// Previously this scanned Gwinn's own platform account and matched everything
// against DEFAULT_TENANT_ID, so it could not see a real merchant payment at all.
describe("runStripeReconciliationForTenant — connected account", () => {
  it("lists payment intents AS the tenant's connected account", async () => {
    const list = vi.fn(() => makeIntentList([]));
    getStripe.mockReturnValue({ paymentIntents: { list } });

    await runStripeReconciliationForTenant(TENANT);

    const [params, options] = list.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    // Without the second argument Stripe answers for the PLATFORM account.
    expect(options).toEqual({ stripeAccount: "acct_aurora" });
    expect(params).toMatchObject({ limit: 100 });
  });

  it("refuses a tenant that has never connected Stripe", async () => {
    getStripe.mockReturnValue({ paymentIntents: { list: vi.fn() } });
    await expect(
      runStripeReconciliationForTenant({
        ...TENANT,
        stripeConnectedAccountId: null,
      }),
    ).rejects.toBeInstanceOf(NotConnectedError);
  });

  it("matches candidates against the tenant's own catalogue", async () => {
    getAvailableProductsForMatching.mockResolvedValue([
      makeProduct({ id: 7, price: "100.00" }),
    ]);
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_new" })]),
      },
    });

    await runStripeReconciliationForTenant(TENANT);
    expect(getAvailableProductsForMatching).toHaveBeenCalledWith(TENANT.id);
  });

  it("files the reconciliation row against the tenant", async () => {
    getAvailableProductsForMatching.mockResolvedValue([makeProduct({ id: 7 })]);
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_new" })]),
      },
    });

    await runStripeReconciliationForTenant(TENANT);
    // The confirm route trusts this column to decide whose products to offer
    // (server/reconciliationRoutes.ts), so a wrong value leaks across stores.
    expect(createStripeReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT.id }),
    );
  });

  it("scopes the already-known id sets to the tenant", async () => {
    getStripe.mockReturnValue({
      paymentIntents: { list: () => makeIntentList([]) },
    });
    await runStripeReconciliationForTenant(TENANT);
    expect(getKnownOrderPaymentIntentIds).toHaveBeenCalledWith(TENANT.id);
    expect(getKnownPosPaymentIntentIds).toHaveBeenCalledWith(TENANT.id);
    expect(getKnownReconciliationPaymentIntentIds).toHaveBeenCalledWith(
      TENANT.id,
    );
  });

  it("emails the merchant, not the platform operator", async () => {
    getAvailableProductsForMatching.mockResolvedValue([makeProduct({ id: 7 })]);
    getTenantSettings.mockResolvedValue({
      whiteLabelName: "Aurora Atelier",
      contactEmail: "hello@aurora.example",
      publicDomain: "aurora.example",
    });
    getStripe.mockReturnValue({
      paymentIntents: {
        list: () => makeIntentList([makePaymentIntent({ id: "pi_new" })]),
      },
    });

    await runStripeReconciliationForTenant(TENANT);

    const [, branding] = sendReconciliationReviewEmail.mock.calls[0];
    expect(branding).toMatchObject({
      to: "owner@aurora.example",
      tenantName: "Aurora Atelier",
    });
  });
});

describe("runStripeReconciliationForAllTenants", () => {
  const A = { id: 1, slug: "a", name: "A", stripeConnectedAccountId: "acct_a" };
  const B = { id: 2, slug: "b", name: "B", stripeConnectedAccountId: "acct_b" };

  it("scans each tenant against their own account and totals the results", async () => {
    getTenantsWithConnectedStripe.mockResolvedValue([A, B]);
    getAvailableProductsForMatching.mockResolvedValue([makeProduct({ id: 7 })]);
    const list = vi.fn(() =>
      makeIntentList([makePaymentIntent({ id: `pi_${Math.random()}` })]),
    );
    getStripe.mockReturnValue({ paymentIntents: { list } });

    const summary = await runStripeReconciliationForAllTenants();

    expect(summary.tenantsScanned).toBe(2);
    expect(summary.tenantsFailed).toBe(0);
    expect(summary.totals.newPendingReview).toBe(2);
    expect(summary.totals.emailsSent).toBe(2);
    // Each call carried that tenant's own account, never the platform's.
    expect(list.mock.calls.map((c) => c[1])).toEqual([
      { stripeAccount: "acct_a" },
      { stripeAccount: "acct_b" },
    ]);
  });

  it("records one tenant's failure without aborting the rest", async () => {
    getTenantsWithConnectedStripe.mockResolvedValue([A, B]);
    getAvailableProductsForMatching.mockResolvedValue([]);
    getStripe.mockReturnValue({
      paymentIntents: {
        list: vi.fn((_params, opts) => {
          if (opts?.stripeAccount === "acct_a") {
            throw new Error("Connect grant revoked");
          }
          return makeIntentList([]);
        }),
      },
    });

    const summary = await runStripeReconciliationForAllTenants();

    // One bad store must not hide every other store's unmatched payments.
    expect(summary.tenantsScanned).toBe(2);
    expect(summary.tenantsFailed).toBe(1);
    const a = summary.perTenant.find((t) => t.tenantId === 1)!;
    const b = summary.perTenant.find((t) => t.tenantId === 2)!;
    expect(a.ok).toBe(false);
    expect(a.ok === false && a.error).toMatch(/revoked/);
    expect(b.ok).toBe(true);
  });

  it("returns an empty sweep when no tenant has connected Stripe", async () => {
    getTenantsWithConnectedStripe.mockResolvedValue([]);
    getStripe.mockReturnValue({ paymentIntents: { list: vi.fn() } });

    const summary = await runStripeReconciliationForAllTenants();
    expect(summary.tenantsScanned).toBe(0);
    expect(summary.perTenant).toEqual([]);
    expect(summary.totals.scannedSucceededPayments).toBe(0);
  });
});
