/**
 * Tests for the Stock In approval router.
 *
 * The cross-tenant case CLAUDE.md asks for is the important one here: approving
 * a diff WRITES stock, so the tenant scoping is what stops an admin of one store
 * applying rows against another's catalogue. As with sheets.ts this is a bare
 * `adminProcedure` scoped through `ctx.user.tenantId`, so the assertion is "acts
 * on the caller's store, never the host's".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ getSheetMirror: vi.fn() }));
vi.mock("../db", () => dbMock);

const sheetsMock = vi.hoisted(() => ({
  isSheetsConfigured: vi.fn(() => true),
}));
vi.mock("../googleSheets", () => sheetsMock);

const stockInMock = vi.hoisted(() => ({
  previewStockIn: vi.fn(),
  applyStockIn: vi.fn(),
  // The real class, so `instanceof` in the router behaves as it does in prod.
  StockInConflictError: class StockInConflictError extends Error {
    constructor() {
      super("The Stock In tab changed since this was reviewed.");
      this.name = "StockInConflictError";
    }
  },
}));
vi.mock("../stockIn", () => stockInMock);

import type { TrpcContext } from "../_core/context";
import { stockInRouter } from "./stockIn";

const TENANT_A = 1;
const TENANT_B = 2;

function ctx(
  role: "admin" | "staff" | null = "admin",
  userTenantId = TENANT_A,
  hostTenantId = TENANT_A,
): TrpcContext {
  return {
    user:
      role === null
        ? null
        : ({ id: 42, tenantId: userTenantId, role } as TrpcContext["user"]),
    tenant: { id: hostTenantId, slug: "host" } as TrpcContext["tenant"],
  } as TrpcContext;
}

function caller(...args: Parameters<typeof ctx>) {
  return stockInRouter.createCaller(ctx(...args));
}

function mirrorRow(over: Record<string, unknown> = {}) {
  return { tenantId: TENANT_A, stockInEnabled: true, ...over };
}

const PREVIEW = {
  rows: [
    {
      rowNumber: 3,
      productId: 1,
      itemName: "Silver ring",
      quantityDelta: 2,
      quantityBefore: 3,
      quantityAfter: 5,
      newPrice: null,
      priceBefore: "45.00",
      note: "",
      status: "ok" as const,
    },
  ],
  applicable: 1,
  hash: "abc123",
};

beforeEach(() => {
  vi.clearAllMocks();
  sheetsMock.isSheetsConfigured.mockReturnValue(true);
  dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
  stockInMock.previewStockIn.mockResolvedValue(PREVIEW);
  stockInMock.applyStockIn.mockResolvedValue({ applied: [], remaining: [] });
});

describe("authorization", () => {
  it("refuses an anonymous preview", async () => {
    await expect(caller(null).preview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(stockInMock.previewStockIn).not.toHaveBeenCalled();
  });

  it("refuses a staff member", async () => {
    await expect(caller("staff").preview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses an anonymous apply", async () => {
    await expect(
      caller(null).applyChanges({ hash: "abc123" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(stockInMock.applyStockIn).not.toHaveBeenCalled();
  });

  it("writes to the CALLER's store, never the host's", async () => {
    // Admin of B, browsing A's subdomain. Approving writes stock, so this is
    // the assertion that matters most in the file.
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow({ tenantId: TENANT_B }));
    await caller("admin", TENANT_B, TENANT_A).applyChanges({ hash: "abc123" });

    expect(dbMock.getSheetMirror).toHaveBeenCalledWith(TENANT_B);
    expect(stockInMock.applyStockIn).toHaveBeenCalledWith(
      TENANT_B,
      42,
      "abc123",
    );
    expect(stockInMock.applyStockIn).not.toHaveBeenCalledWith(
      TENANT_A,
      expect.anything(),
      expect.anything(),
    );
  });

  it("previews only the caller's own store", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow({ tenantId: TENANT_B }));
    await caller("admin", TENANT_B, TENANT_A).preview();
    expect(stockInMock.previewStockIn).toHaveBeenCalledWith(TENANT_B);
  });
});

describe("availability", () => {
  it("refuses when the installation has no Google credentials", async () => {
    sheetsMock.isSheetsConfigured.mockReturnValue(false);
    await expect(caller().preview()).rejects.toThrow(/not configured/i);
    expect(stockInMock.previewStockIn).not.toHaveBeenCalled();
  });

  it("refuses when the store has no mirror", async () => {
    dbMock.getSheetMirror.mockResolvedValue(null);
    await expect(caller().preview()).rejects.toThrow(/no spreadsheet mirror/i);
  });

  it("refuses when the inbound lane is switched off", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: false }),
    );
    await expect(caller().preview()).rejects.toThrow(/switched off/i);
    expect(stockInMock.previewStockIn).not.toHaveBeenCalled();
  });

  it("gates apply on the same three checks as preview", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: false }),
    );
    await expect(caller().applyChanges({ hash: "abc123" })).rejects.toThrow(
      /switched off/i,
    );
    expect(stockInMock.applyStockIn).not.toHaveBeenCalled();
  });
});

describe("preview", () => {
  it("returns the diff and its fingerprint", async () => {
    expect(await caller().preview()).toEqual(PREVIEW);
  });

  it("maps a Sheets failure to a gateway error", async () => {
    stockInMock.previewStockIn.mockRejectedValue(new Error("File not found"));
    await expect(caller().preview()).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: "File not found",
    });
  });
});

describe("applyChanges", () => {
  it("passes the reviewed fingerprint through unchanged", async () => {
    await caller().applyChanges({ hash: "deadbeef" });
    expect(stockInMock.applyStockIn).toHaveBeenCalledWith(
      TENANT_A,
      42,
      "deadbeef",
    );
  });

  /**
   * An apply with no hash would be an apply of whatever the tab happens to say
   * right now — which is exactly the review step this router exists to enforce.
   */
  it("rejects an empty hash at the schema", async () => {
    await expect(caller().applyChanges({ hash: "" })).rejects.toThrow();
    expect(stockInMock.applyStockIn).not.toHaveBeenCalled();
  });

  it("maps a stale approval to CONFLICT, not to a bad request", async () => {
    stockInMock.applyStockIn.mockRejectedValue(
      new stockInMock.StockInConflictError(),
    );
    await expect(
      caller().applyChanges({ hash: "abc123" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("maps any other failure to a gateway error", async () => {
    stockInMock.applyStockIn.mockRejectedValue(new Error("quota exhausted"));
    await expect(
      caller().applyChanges({ hash: "abc123" }),
    ).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: "quota exhausted",
    });
  });

  it("returns what was applied and what is still outstanding", async () => {
    stockInMock.applyStockIn.mockResolvedValue({
      applied: [
        {
          productId: 1,
          quantityBefore: 3,
          quantityAfter: 5,
          priceBefore: "45.00",
          priceAfter: "45.00",
        },
      ],
      remaining: [{ rowNumber: 4, status: "unknown_product" }],
    });
    const result = await caller().applyChanges({ hash: "abc123" });
    expect(result.applied).toHaveLength(1);
    expect(result.remaining).toHaveLength(1);
  });
});
