import { describe, expect, it, beforeAll } from "vitest";

// No DATABASE_URL and no drizzle mock → getDb() returns null, so we exercise
// the withDb / withDbOrThrow fallbacks: reads degrade to a fallback value,
// writes throw. (This module gets an isolated module registry, so unsetting
// DATABASE_URL here does not affect db.test.ts.)
beforeAll(() => {
  delete process.env.DATABASE_URL;
});

import {
  getAllProducts,
  getVisibleProducts,
  getProductById,
  getOrderBySessionId,
  getBulkUploadLogs,
  getTenantByPosApiKey,
  createProduct,
  deleteProduct,
  addInstagramPost,
  insertBulkUploadLog,
  countPhotoGenerationsThisMonth,
  getTenantStaff,
  countTenantStaff,
  getPendingStaffInvites,
  getStaffInviteByToken,
  getTenantSettingsByDomain,
  getTenantByCustomDomain,
  createStaffInvite,
  joinTenantAsStaff,
  countTenantProducts,
  hasPhotoConsumption,
  getPhotoCreditHistory,
  addPhotoCreditEntry,
  recordPhotoGeneration,
  getMagicLinkTokenByToken,
  createMagicLinkToken,
  consumeMagicLinkToken,
} from "./db";

describe("db helpers when the database is unavailable", () => {
  it("read helpers return their fallback (empty array)", async () => {
    await expect(getAllProducts()).resolves.toEqual([]);
    await expect(getVisibleProducts()).resolves.toEqual([]);
    await expect(getBulkUploadLogs()).resolves.toEqual([]);
  });

  it("single-row read helpers return undefined", async () => {
    await expect(getProductById(1)).resolves.toBeUndefined();
    await expect(getOrderBySessionId("cs_missing")).resolves.toBeUndefined();
    // POS auth must fail closed when the DB is down (→ undefined → 401, not a crash).
    await expect(getTenantByPosApiKey("any-key")).resolves.toBeUndefined();
  });

  it("write helpers throw", async () => {
    await expect(
      createProduct({
        name: "x",
        description: "y",
        price: "1.00",
        category: "Other",
      }),
    ).rejects.toThrow(/Database not available/);
    await expect(deleteProduct(1)).rejects.toThrow(/Database not available/);
    await expect(
      addInstagramPost("https://instagram.com/p/1", 0),
    ).rejects.toThrow(/Database not available/);
  });

  it("soft-failing writes no-op instead of throwing", async () => {
    // upsertUser and insertBulkUploadLog intentionally warn + return.
    await expect(
      insertBulkUploadLog({ operation: "analyze", ref: "r" }),
    ).resolves.toBeUndefined();
  });

  it("photo usage reads degrade to zero/empty, writes throw", async () => {
    await expect(countPhotoGenerationsThisMonth(1)).resolves.toBe(0);
    await expect(getPhotoCreditHistory(1)).resolves.toEqual([]);
    await expect(
      addPhotoCreditEntry({ tenantId: 1, delta: 10, kind: "purchase" }),
    ).rejects.toThrow(/Database not available/);
    // With the DB down, recording a generation throws at the write — the
    // generation is refused rather than given away untracked.
    await expect(recordPhotoGeneration(1, 5)).rejects.toThrow(
      /Database not available/,
    );
  });

  it("onboarding derivation reads degrade to zero/false", async () => {
    await expect(countTenantProducts(1)).resolves.toBe(0);
    await expect(hasPhotoConsumption(1)).resolves.toBe(false);
  });

  it("staff reads degrade to empty/zero, staff writes throw", async () => {
    await expect(getTenantStaff(1)).resolves.toEqual([]);
    await expect(countTenantStaff(1)).resolves.toBe(0);
    await expect(getPendingStaffInvites(1)).resolves.toEqual([]);
    await expect(getStaffInviteByToken("t")).resolves.toBeUndefined();
    await expect(
      getTenantSettingsByDomain("x.example.com"),
    ).resolves.toBeUndefined();
    // Custom-domain resolution runs on every storefront request: with the
    // database down it must degrade to "no tenant", not throw out of the tRPC
    // context builder.
    await expect(
      getTenantByCustomDomain("x.example.com"),
    ).resolves.toBeUndefined();
    await expect(
      createStaffInvite({
        tenantId: 1,
        email: "x@a.example",
        token: "t",
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(/Database not available/);
    await expect(joinTenantAsStaff(1, 1)).rejects.toThrow(
      /Database not available/,
    );
  });

  it("magic link reads degrade to undefined, writes throw", async () => {
    await expect(getMagicLinkTokenByToken("t")).resolves.toBeUndefined();
    await expect(
      createMagicLinkToken({
        email: "x@a.example",
        token: "t",
        next: null,
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(/Database not available/);
    await expect(consumeMagicLinkToken(1)).rejects.toThrow(
      /Database not available/,
    );
  });

  it("rejects invalid credit deltas before touching the DB", async () => {
    await expect(
      addPhotoCreditEntry({ tenantId: 1, delta: 0, kind: "purchase" }),
    ).rejects.toThrow(/non-zero integer/);
    await expect(
      addPhotoCreditEntry({ tenantId: 1, delta: 1.5, kind: "purchase" }),
    ).rejects.toThrow(/non-zero integer/);
  });
});
