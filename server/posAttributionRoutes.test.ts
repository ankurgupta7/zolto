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
