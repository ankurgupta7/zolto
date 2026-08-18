import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, trustpilotMock } = vi.hoisted(() => ({
  dbMock: { getTenantSettings: vi.fn() },
  trustpilotMock: {
    fetchTrustpilotSummary: vi.fn(),
    isTrustpilotConfigured: vi.fn(),
  },
}));

vi.mock("../db", () => dbMock);
vi.mock("../trustpilot", () => trustpilotMock);

import { trustpilotRouter } from "./trustpilot";
import type { TrpcContext } from "../_core/context";

const TENANT_ID = 7;
const OTHER_TENANT_ID = 8;

function ctx(
  opts: {
    role?: "staff" | "admin";
    userTenantId?: number;
    tenant?: number | null;
  } = {},
): TrpcContext {
  const { role, userTenantId = TENANT_ID, tenant = TENANT_ID } = opts;
  return {
    user: role ? ({ id: 1, tenantId: userTenantId, role } as never) : null,
    tenant: tenant === null ? null : ({ id: tenant, slug: "shop" } as never),
    req: {} as never,
    res: {} as never,
  };
}

const SUMMARY = {
  domain: "kalakosh.ch",
  displayName: "Kalakosh",
  stars: 4.5,
  trustScore: 4.6,
  numberOfReviews: 128,
  profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getTenantSettings.mockResolvedValue({
    trustpilotDomain: "kalakosh.ch",
    trustpilotShowRating: true,
  });
  trustpilotMock.fetchTrustpilotSummary.mockResolvedValue(SUMMARY);
  trustpilotMock.isTrustpilotConfigured.mockReturnValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("trustpilot.summary (public)", () => {
  it("reads the store from the request host, not from the caller", async () => {
    await trustpilotRouter.createCaller(ctx()).summary();
    expect(dbMock.getTenantSettings).toHaveBeenCalledWith(TENANT_ID);
  });

  it("returns the profile link, the review link and the live rating", async () => {
    const result = await trustpilotRouter.createCaller(ctx()).summary();
    expect(result).toEqual({
      connected: true,
      domain: "kalakosh.ch",
      profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
      reviewUrl: "https://ch.trustpilot.com/evaluate/kalakosh.ch",
      summary: SUMMARY,
    });
  });

  it("reports a store with no Trustpilot profile as simply not connected", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ trustpilotDomain: null });
    expect(await trustpilotRouter.createCaller(ctx()).summary()).toEqual({
      connected: false,
    });
    expect(trustpilotMock.fetchTrustpilotSummary).not.toHaveBeenCalled();
  });

  it("normalises a domain saved in some other shape", async () => {
    dbMock.getTenantSettings.mockResolvedValue({
      trustpilotDomain: "https://www.kalakosh.ch/",
      trustpilotShowRating: true,
    });
    const result = await trustpilotRouter.createCaller(ctx()).summary();
    expect(result).toMatchObject({ connected: true, domain: "kalakosh.ch" });
  });

  it("keeps the links but drops the stars when the merchant hides the rating", async () => {
    dbMock.getTenantSettings.mockResolvedValue({
      trustpilotDomain: "kalakosh.ch",
      trustpilotShowRating: false,
    });
    const result = await trustpilotRouter.createCaller(ctx()).summary();
    expect(result).toMatchObject({ connected: true, summary: null });
    expect(trustpilotMock.fetchTrustpilotSummary).not.toHaveBeenCalled();
  });

  it("still returns the links when the rating can't be fetched", async () => {
    trustpilotMock.fetchTrustpilotSummary.mockResolvedValue(null);
    const result = await trustpilotRouter.createCaller(ctx()).summary();
    expect(result).toMatchObject({
      connected: true,
      profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
      summary: null,
    });
  });

  it("throws NOT_FOUND when no store is resolved", async () => {
    await expect(
      trustpilotRouter.createCaller(ctx({ tenant: null })).summary(),
    ).rejects.toThrow(/not found/i);
  });
});

describe("trustpilot.status (admin)", () => {
  it("tells the merchant whether the platform can fetch ratings at all", async () => {
    trustpilotMock.isTrustpilotConfigured.mockReturnValue(false);
    trustpilotMock.fetchTrustpilotSummary.mockResolvedValue(null);
    const result = await trustpilotRouter
      .createCaller(ctx({ role: "admin" }))
      .status();
    expect(result).toMatchObject({
      ratingsAvailable: false,
      domain: "kalakosh.ch",
      summary: null,
    });
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      trustpilotRouter.createCaller(ctx()).status(),
    ).rejects.toThrow();
  });

  it("refuses a signed-in non-admin", async () => {
    await expect(
      trustpilotRouter.createCaller(ctx({ role: "staff" })).status(),
    ).rejects.toThrow();
  });

  it("refuses an admin of a DIFFERENT store addressing this one", async () => {
    await expect(
      trustpilotRouter
        .createCaller(
          ctx({
            role: "admin",
            userTenantId: OTHER_TENANT_ID,
            tenant: TENANT_ID,
          }),
        )
        .status(),
    ).rejects.toThrow();
    expect(dbMock.getTenantSettings).not.toHaveBeenCalled();
  });
});
