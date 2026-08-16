import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, backfillMock } = vi.hoisted(() => ({
  dbMock: {
    getPosSalesWithItems: vi.fn(),
    getPaidOrders: vi.fn(),
    getProductsByIds: vi.fn(),
  },
  backfillMock: vi.fn(),
}));

vi.mock("../db", () => dbMock);
vi.mock("../posBackfill", () => ({
  MAX_ORDERS_SCANNED: 500,
  backfillPosLineItems: backfillMock,
}));

import { salesRouter } from "./sales";
import type { TrpcContext } from "../_core/context";

const TENANT_ID = 7;
const OTHER_TENANT_ID = 8;

function ctx(
  opts: {
    role?: "staff" | "admin" | "superadmin";
    userTenantId?: number;
    /** The store the request HOST resolves to — deliberately variable. */
    tenant?: number | null;
  } = {},
): TrpcContext {
  const { role, userTenantId = TENANT_ID, tenant = TENANT_ID } = opts;
  return {
    user: role ? ({ id: 1, tenantId: userTenantId, role } as never) : null,
    tenant: tenant === null ? null : ({ id: tenant, slug: "shop" } as never),
    req: { ip: "203.0.113.9" } as never,
    res: {} as never,
  };
}

function posSale(
  over: Partial<{
    id: number;
    invoiceNumber: string | null;
    totalRappen: number;
    paymentMethod: string;
    createdAt: Date;
    customerName: string | null;
    customerEmail: string | null;
  }> = {},
  items: Array<{
    productId: number | null;
    name: string;
    priceRappen: number;
  }> = [{ productId: 1, name: "Pearl Ring", priceRappen: 15000 }],
) {
  return {
    order: {
      id: 9,
      tenantId: TENANT_ID,
      invoiceNumber: "KPOS-9",
      stripePaymentIntentId: null,
      status: "paid",
      paymentMethod: "cash",
      totalRappen: 15000,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      receiptUrl: null,
      createdAt: new Date("2026-08-16T12:14:47Z"),
      ...over,
    },
    items,
  };
}

function onlineOrder(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    tenantId: TENANT_ID,
    stripeSessionId: "cs_1",
    stripePaymentIntentId: "pi_1",
    status: "paid",
    customerEmail: "buyer@example.com",
    customerName: "Buyer",
    amountTotal: 8000,
    currency: "chf",
    productIds: "1,2",
    paymentMethod: "card",
    createdAt: new Date("2026-08-15T09:00:00Z"),
    updatedAt: new Date("2026-08-15T09:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getPosSalesWithItems.mockResolvedValue([]);
  dbMock.getPaidOrders.mockResolvedValue([]);
  dbMock.getProductsByIds.mockResolvedValue([]);
});

describe("sales.list authorization", () => {
  it("rejects an anonymous caller", async () => {
    await expect(
      salesRouter.createCaller(ctx()).list({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a signed-in non-admin", async () => {
    await expect(
      salesRouter.createCaller(ctx({ role: "staff" })).list({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // The cross-tenant case is the one that regresses silently: an admin of
  // store A pointing at store B's host must still only see A's ledger.
  it("reads the caller's own store, never the host's store", async () => {
    await salesRouter
      .createCaller(
        ctx({
          role: "admin",
          userTenantId: OTHER_TENANT_ID,
          tenant: TENANT_ID,
        }),
      )
      .list({});

    expect(dbMock.getPosSalesWithItems).toHaveBeenCalledWith(
      OTHER_TENANT_ID,
      expect.anything(),
    );
    expect(dbMock.getPaidOrders).toHaveBeenCalledWith(
      OTHER_TENANT_ID,
      expect.any(Number),
      expect.anything(),
    );
  });

  it("still works when the host resolves to no store at all", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([posSale()]);
    const result = await salesRouter
      .createCaller(ctx({ role: "admin", tenant: null }))
      .list({});
    expect(result.rows).toHaveLength(1);
  });
});

describe("sales.list ledger", () => {
  const caller = () => salesRouter.createCaller(ctx({ role: "admin" }));

  it("returns in-person sales with their line item names and prices", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      posSale({}, [
        { productId: 1, name: "Pearl Ring", priceRappen: 10000 },
        { productId: null, name: "Gift wrap", priceRappen: 5000 },
      ]),
    ]);

    const result = await caller().list({});

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      key: "pos-9",
      channel: "pos",
      reference: "KPOS-9",
      paymentMethod: "cash",
      amountMinor: 15000,
      createdAt: "2026-08-16T12:14:47.000Z",
    });
    expect(result.rows[0].items).toEqual([
      { productId: 1, name: "Pearl Ring", amountMinor: 10000 },
      { productId: null, name: "Gift wrap", amountMinor: 5000 },
    ]);
  });

  it("resolves online order product names in one batched lookup", async () => {
    dbMock.getPaidOrders.mockResolvedValue([onlineOrder()]);
    dbMock.getProductsByIds.mockResolvedValue([
      { id: 1, name: "Pearl Ring" },
      { id: 2, name: "Silver Cuff" },
    ]);

    const result = await caller().list({});

    expect(dbMock.getProductsByIds).toHaveBeenCalledTimes(1);
    expect(dbMock.getProductsByIds).toHaveBeenCalledWith(TENANT_ID, [1, 2]);
    expect(result.rows[0].items.map((i) => i.name)).toEqual([
      "Pearl Ring",
      "Silver Cuff",
    ]);
  });

  it("merges both channels newest first", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      posSale({ id: 9, createdAt: new Date("2026-08-16T12:00:00Z") }),
      posSale({
        id: 8,
        invoiceNumber: "KPOS-8",
        createdAt: new Date("2026-08-14T12:00:00Z"),
      }),
    ]);
    dbMock.getPaidOrders.mockResolvedValue([
      onlineOrder({ id: 3, createdAt: new Date("2026-08-15T09:00:00Z") }),
    ]);

    const result = await caller().list({});

    expect(result.rows.map((r) => r.key)).toEqual([
      "pos-9",
      "online-3",
      "pos-8",
    ]);
  });

  it("totals the ledger by channel", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      posSale({ totalRappen: 15000 }),
    ]);
    dbMock.getPaidOrders.mockResolvedValue([
      onlineOrder({ amountTotal: 8000 }),
    ]);

    const { totals } = await caller().list({});

    expect(totals).toEqual({
      count: 2,
      grossMinor: 23000,
      posCount: 1,
      posGrossMinor: 15000,
      onlineCount: 1,
      onlineGrossMinor: 8000,
    });
  });

  it("filters to one channel without querying the other", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([posSale()]);

    const result = await caller().list({ channel: "pos" });

    expect(dbMock.getPaidOrders).not.toHaveBeenCalled();
    expect(result.rows.every((r) => r.channel === "pos")).toBe(true);
  });

  it("filters by payment method", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      posSale({ id: 9, paymentMethod: "cash" }),
      posSale({ id: 8, invoiceNumber: "KPOS-8", paymentMethod: "twint" }),
    ]);

    const result = await caller().list({ paymentMethod: "twint" });

    expect(result.rows.map((r) => r.id)).toEqual([8]);
    // The offered filter values come from what the store has actually taken.
    expect(result.paymentMethods).toEqual(["cash", "twint"]);
  });

  it("searches item names, not just references and customers", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      posSale({ id: 9 }, [
        { productId: 1, name: "Pearl Ring", priceRappen: 15000 },
      ]),
      posSale({ id: 8, invoiceNumber: "KPOS-8" }, [
        { productId: 2, name: "Silver Cuff", priceRappen: 15000 },
      ]),
    ]);

    const result = await caller().list({ search: "pearl" });

    expect(result.rows.map((r) => r.id)).toEqual([9]);
  });

  it("passes a parsed date range down to both channels", async () => {
    await caller().list({ from: "2026-08-01", to: "2026-09-01" });

    expect(dbMock.getPosSalesWithItems).toHaveBeenCalledWith(TENANT_ID, {
      limit: 200,
      from: new Date("2026-08-01"),
      to: new Date("2026-09-01"),
    });
    expect(dbMock.getPaidOrders).toHaveBeenCalledWith(TENANT_ID, 200, {
      from: new Date("2026-08-01"),
      to: new Date("2026-09-01"),
    });
  });

  it("ignores an unparseable date rather than 500ing", async () => {
    await expect(caller().list({ from: "last tuesday" })).resolves.toBeTruthy();
    expect(dbMock.getPosSalesWithItems).toHaveBeenCalledWith(TENANT_ID, {
      limit: 200,
      from: undefined,
      to: undefined,
    });
  });

  it("flags a window that hit the cap, so the totals aren't read as complete", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      posSale(),
      posSale({ id: 8 }),
    ]);

    const notFull = await caller().list({ limit: 5 });
    expect(notFull.truncated).toBe(false);

    const full = await caller().list({ limit: 2 });
    expect(full.truncated).toBe(true);
  });

  it("falls back to a derived reference when a sale has no invoice number", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      posSale({ id: 42, invoiceNumber: null }),
    ]);

    const result = await caller().list({});

    expect(result.rows[0].reference).toBe("KPOS-42");
  });
});

describe("sales.backfillLineItems", () => {
  beforeEach(() => {
    backfillMock.mockResolvedValue({ scanned: 0, restored: 0, skipped: [] });
  });

  it("rejects a signed-in non-admin", async () => {
    await expect(
      salesRouter.createCaller(ctx({ role: "staff" })).backfillLineItems({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(backfillMock).not.toHaveBeenCalled();
  });

  // A repair writes. The cross-tenant case is the one that regresses silently:
  // an admin of store A pointing at store B's host must repair A, never B.
  it("repairs the caller's own store, never the host's store", async () => {
    await salesRouter
      .createCaller(
        ctx({
          role: "admin",
          userTenantId: OTHER_TENANT_ID,
          tenant: TENANT_ID,
        }),
      )
      .backfillLineItems({});

    expect(backfillMock).toHaveBeenCalledWith(
      OTHER_TENANT_ID,
      expect.anything(),
    );
  });

  // Nothing is written until the admin has read a preview and said so.
  it("previews unless the caller explicitly asks to apply", async () => {
    const caller = salesRouter.createCaller(ctx({ role: "admin" }));

    await caller.backfillLineItems({});
    expect(backfillMock).toHaveBeenLastCalledWith(
      TENANT_ID,
      expect.objectContaining({ dryRun: true }),
    );

    await caller.backfillLineItems({ dryRun: false });
    expect(backfillMock).toHaveBeenLastCalledWith(
      TENANT_ID,
      expect.objectContaining({ dryRun: false }),
    );
  });
});
