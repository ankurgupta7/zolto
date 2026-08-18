import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const getProductById = vi.fn();
const getPosAttributionByToken = vi.fn();
const rejectPosAttribution = vi.fn();
const resolvePosAttributionConfirmed = vi.fn();

vi.mock("./db", () => ({
  getProductById: (...args: unknown[]) => getProductById(...args),
  getPosAttributionByToken: (...args: unknown[]) =>
    getPosAttributionByToken(...args),
  rejectPosAttribution: (...args: unknown[]) => rejectPosAttribution(...args),
  resolvePosAttributionConfirmed: (...args: unknown[]) =>
    resolvePosAttributionConfirmed(...args),
}));

import { registerPosAttributionRoutes } from "./posAttributionRoutes";

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  registerPosAttributionRoutes(app);
  return app;
}

const pendingAttribution = {
  id: 1,
  tenantId: 3,
  posOrderId: 10,
  posOrderItemId: 100,
  amountRappen: 5000,
  status: "pending_review" as const,
  candidateProductIds: "7,8",
  chosenProductId: null,
  confirmationToken: "tok_abc",
  // A mailed link is only live inside its window; a row with no expiry reads as
  // expired, so every fixture that expects the link to work needs one.
  tokenExpiresAt: new Date(Date.now() + 7 * 86400 * 1000),
};

const sampleProduct = {
  id: 7,
  name: "Silberring",
  nameEn: "Silver Ring",
  price: "50.00",
  sold: false,
  quantity: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/pos-attribution/confirm", () => {
  it("404s when the token is missing", async () => {
    const res = await request(buildApp()).get("/api/pos-attribution/confirm");
    expect(res.status).toBe(404);
    expect(getPosAttributionByToken).not.toHaveBeenCalled();
  });

  it("410s when the attribution was already handled", async () => {
    getPosAttributionByToken.mockResolvedValue({
      ...pendingAttribution,
      status: "confirmed",
    });
    const res = await request(buildApp())
      .get("/api/pos-attribution/confirm")
      .query({ token: "tok_abc", choice: "0" });
    expect(res.status).toBe(410);
  });

  it("renders a confirm page naming the chosen piece", async () => {
    getPosAttributionByToken.mockResolvedValue(pendingAttribution);
    getProductById.mockResolvedValue(sampleProduct);
    const res = await request(buildApp())
      .get("/api/pos-attribution/confirm")
      .query({ token: "tok_abc", choice: "0" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Silver Ring");
    // GET must not mutate anything.
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
    expect(rejectPosAttribution).not.toHaveBeenCalled();
  });

  it("400s on an out-of-range choice", async () => {
    getPosAttributionByToken.mockResolvedValue(pendingAttribution);
    const res = await request(buildApp())
      .get("/api/pos-attribution/confirm")
      .query({ token: "tok_abc", choice: "9" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/pos-attribution/confirm", () => {
  it("attributes the sale to the chosen product and updates stock", async () => {
    getPosAttributionByToken.mockResolvedValue(pendingAttribution);
    getProductById.mockResolvedValue(sampleProduct);

    const res = await request(buildApp())
      .post("/api/pos-attribution/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("Silver Ring");
    // Attributes the existing line (id 100) to product 7 for tenant 3 — no new order.
    expect(resolvePosAttributionConfirmed).toHaveBeenCalledWith(1, 100, 7, 3);
  });

  it("marks the sale for manual sorting when 'none' is chosen", async () => {
    getPosAttributionByToken.mockResolvedValue(pendingAttribution);

    const res = await request(buildApp())
      .post("/api/pos-attribution/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "none" });

    expect(res.status).toBe(200);
    expect(rejectPosAttribution).toHaveBeenCalledWith(1);
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
  });

  it("409s when the chosen piece is already sold or out of stock", async () => {
    getPosAttributionByToken.mockResolvedValue(pendingAttribution);
    getProductById.mockResolvedValue({ ...sampleProduct, sold: true });

    const res = await request(buildApp())
      .post("/api/pos-attribution/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(409);
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
  });

  it("410s when the attribution was already handled", async () => {
    getPosAttributionByToken.mockResolvedValue({
      ...pendingAttribution,
      status: "rejected",
    });

    const res = await request(buildApp())
      .post("/api/pos-attribution/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(410);
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
  });
});

// The in-person sibling of the same two rules — see reconciliationRoutes.test.ts.
describe("the mailed link's lifetime", () => {
  it("410s on an expired link, without touching stock", async () => {
    getPosAttributionByToken.mockResolvedValue({
      ...pendingAttribution,
      tokenExpiresAt: new Date(Date.now() - 60_000),
    });
    const app = buildApp();

    const get = await request(app).get(
      "/api/pos-attribution/confirm?token=tok_abc&choice=0",
    );
    expect(get.status).toBe(410);

    const post = await request(app)
      .post("/api/pos-attribution/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });
    expect(post.status).toBe(410);
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
    expect(rejectPosAttribution).not.toHaveBeenCalled();
  });

  it("410s on a row whose expiry was never set", async () => {
    getPosAttributionByToken.mockResolvedValue({
      ...pendingAttribution,
      tokenExpiresAt: null,
    });
    const app = buildApp();
    const res = await request(app).get(
      "/api/pos-attribution/confirm?token=tok_abc&choice=0",
    );
    expect(res.status).toBe(410);
  });

  it("404s once the token has been spent", async () => {
    getPosAttributionByToken.mockResolvedValue(undefined);
    const app = buildApp();
    const res = await request(app)
      .post("/api/pos-attribution/confirm")
      .type("form")
      .send({ token: "tok_abc", choice: "0" });

    expect(res.status).toBe(404);
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
  });
});
