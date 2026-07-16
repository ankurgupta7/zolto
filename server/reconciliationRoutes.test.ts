import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const getProductById = vi.fn();
const getStripeReconciliationByToken = vi.fn();
const rejectStripeReconciliation = vi.fn();
const resolveStripeReconciliationConfirmed = vi.fn();

vi.mock("./db", () => ({
  getProductById: (...args: unknown[]) => getProductById(...args),
  getStripeReconciliationByToken: (...args: unknown[]) =>
    getStripeReconciliationByToken(...args),
  rejectStripeReconciliation: (...args: unknown[]) =>
    rejectStripeReconciliation(...args),
  resolveStripeReconciliationConfirmed: (...args: unknown[]) =>
    resolveStripeReconciliationConfirmed(...args),
}));

import { registerReconciliationRoutes } from "./reconciliationRoutes";

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  registerReconciliationRoutes(app);
  return app;
}

const pendingReconciliation = {
  id: 1,
  stripePaymentIntentId: "pi_test_1",
  amountRappen: 10000,
  currency: "chf",
  status: "pending_review" as const,
  candidateProductIds: "7,8",
  chosenProductId: null,
  confirmationToken: "tok_abc",
};

const sampleProduct = {
  id: 7,
  name: "Silberring",
  nameEn: "Silver Ring",
  price: "100.00",
  sold: false,
  quantity: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reconciliation/confirm", () => {
  it("404s when the token is missing", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/reconciliation/confirm");
    expect(res.status).toBe(404);
    expect(getStripeReconciliationByToken).not.toHaveBeenCalled();
  });

  it("404s when the token does not match a reconciliation", async () => {
    getStripeReconciliationByToken.mockResolvedValue(undefined);
    const app = buildApp();
    const res = await request(app).get(
      "/api/reconciliation/confirm?token=nope&choice=0"
    );
    expect(res.status).toBe(404);
  });

  it("410s when the reconciliation was already resolved", async () => {
    getStripeReconciliationByToken.mockResolvedValue({
      ...pendingReconciliation,
      status: "confirmed",
    });
    const app = buildApp();
    const res = await request(app).get(
      "/api/reconciliation/confirm?token=tok_abc&choice=0"
    );
    expect(res.status).toBe(410);
  });

  it("400s on an out-of-range choice index", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    const app = buildApp();
    const res = await request(app).get(
      "/api/reconciliation/confirm?token=tok_abc&choice=5"
    );
    expect(res.status).toBe(400);
  });

  it("400s on a malformed choice", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    const app = buildApp();
    const res = await request(app).get(
      "/api/reconciliation/confirm?token=tok_abc&choice=banana"
    );
    expect(res.status).toBe(400);
  });

  it("renders a confirmation page naming the candidate product", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    getProductById.mockResolvedValue(sampleProduct);
    const app = buildApp();
    const res = await request(app).get(
      "/api/reconciliation/confirm?token=tok_abc&choice=0"
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("Silver Ring");
    expect(res.text).toContain('method="POST"');
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });

  it("renders a manual-review confirmation page for choice=none", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    const app = buildApp();
    const res = await request(app).get(
      "/api/reconciliation/confirm?token=tok_abc&choice=none"
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("manual review");
    expect(rejectStripeReconciliation).not.toHaveBeenCalled();
  });

  it("escapes a malicious payment intent id in the page", async () => {
    getStripeReconciliationByToken.mockResolvedValue({
      ...pendingReconciliation,
      stripePaymentIntentId: `<script>alert(1)</script>`,
    });
    const app = buildApp();
    const res = await request(app).get(
      "/api/reconciliation/confirm?token=tok_abc&choice=none"
    );
    expect(res.text).not.toContain("<script>alert(1)</script>");
  });
});

describe("POST /api/reconciliation/confirm", () => {
  it("marks the reconciliation rejected for choice=none without touching inventory", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    const app = buildApp();
    const res = await request(app)
      .post("/api/reconciliation/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "none" });

    expect(res.status).toBe(200);
    expect(rejectStripeReconciliation).toHaveBeenCalledWith(1);
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });

  it("confirms the chosen candidate and updates inventory", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    getProductById.mockResolvedValue(sampleProduct);
    const app = buildApp();
    const res = await request(app)
      .post("/api/reconciliation/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(200);
    expect(resolveStripeReconciliationConfirmed).toHaveBeenCalledWith(
      1,
      7,
      10000,
      "pi_test_1"
    );
    expect(res.text).toContain("Silver Ring");
  });

  it("409s when the candidate product is already sold", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    getProductById.mockResolvedValue({ ...sampleProduct, sold: true });
    const app = buildApp();
    const res = await request(app)
      .post("/api/reconciliation/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(409);
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });

  it("409s when the candidate product is out of stock", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    getProductById.mockResolvedValue({ ...sampleProduct, quantity: 0 });
    const app = buildApp();
    const res = await request(app)
      .post("/api/reconciliation/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(409);
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });

  it("410s when the token was already resolved (prevents double-spend of a link)", async () => {
    getStripeReconciliationByToken.mockResolvedValue({
      ...pendingReconciliation,
      status: "rejected",
    });
    const app = buildApp();
    const res = await request(app)
      .post("/api/reconciliation/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(410);
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });

  it("404s for an unknown token", async () => {
    getStripeReconciliationByToken.mockResolvedValue(undefined);
    const app = buildApp();
    const res = await request(app)
      .post("/api/reconciliation/confirm")
      .type("form")
      .send({ token: "nope", choice: "0" });

    expect(res.status).toBe(404);
  });

  it("400s on a malformed choice", async () => {
    getStripeReconciliationByToken.mockResolvedValue(pendingReconciliation);
    const app = buildApp();
    const res = await request(app)
      .post("/api/reconciliation/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "not-a-number" });

    expect(res.status).toBe(400);
  });
});
