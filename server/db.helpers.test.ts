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
  createProduct,
  deleteProduct,
  addInstagramPost,
  insertBulkUploadLog,
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
  });

  it("write helpers throw", async () => {
    await expect(
      createProduct({
        name: "x",
        description: "y",
        price: "1.00",
        category: "Other",
      })
    ).rejects.toThrow(/Database not available/);
    await expect(deleteProduct(1)).rejects.toThrow(/Database not available/);
    await expect(
      addInstagramPost("https://instagram.com/p/1", 0)
    ).rejects.toThrow(/Database not available/);
  });

  it("soft-failing writes no-op instead of throwing", async () => {
    // upsertUser and insertBulkUploadLog intentionally warn + return.
    await expect(
      insertBulkUploadLog({ operation: "analyze", ref: "r" })
    ).resolves.toBeUndefined();
  });
});
