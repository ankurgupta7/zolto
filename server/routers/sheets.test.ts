/**
 * Tests for the spreadsheet-mirror router.
 *
 * The cross-tenant test is the one CLAUDE.md asks for, in the form this shape
 * needs. `sheetsRouter` uses a bare `adminProcedure` and scopes everything
 * through `ctx.user.tenantId`, so a foreign admin is not *refused* — they simply
 * act on their own store. That is only safe as long as no handler reads
 * `ctx.tenant`, and the assertion below is what will fail if one ever starts to:
 * an admin of store B addressing store A's host must touch B and never A, and
 * must never put A's name on B's spreadsheet.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  getSheetMirror: vi.fn(),
  getTenantById: vi.fn(),
  insertAuditLog: vi.fn(),
}));
vi.mock("../db", () => dbMock);

const sheetsMock = vi.hoisted(() => ({
  isSheetsConfigured: vi.fn(() => true),
}));
vi.mock("../googleSheets", () => sheetsMock);

const mirrorMock = vi.hoisted(() => ({
  connectSheetMirror: vi.fn(),
  disconnectSheetMirror: vi.fn(),
  setStockInEnabled: vi.fn(),
  syncSheetMirror: vi.fn(),
}));
vi.mock("../sheetMirror", () => mirrorMock);

import type { TrpcContext } from "../_core/context";
import { sheetsRouter } from "./sheets";

const TENANT_A = 1;
const TENANT_B = 2;

function ctx(
  role: "admin" | "staff" | "superadmin" | null = "admin",
  userTenantId = TENANT_A,
  hostTenantId = TENANT_A,
  // How this admin signed in. "google" is the case that hands us a Google
  // address for free; the others are why the fallback field exists at all.
  loginMethod: "google" | "apple" | "magic_link" = "google",
  email: string | null = "admin@example.com",
): TrpcContext {
  return {
    user:
      role === null
        ? null
        : ({
            id: 42,
            tenantId: userTenantId,
            role,
            email,
            loginMethod,
          } as TrpcContext["user"]),
    // The host-derived store. Nothing in this router may read it.
    tenant: {
      id: hostTenantId,
      name: "Host Store",
      slug: "host",
    } as TrpcContext["tenant"],
  } as TrpcContext;
}

function caller(...args: Parameters<typeof ctx>) {
  return sheetsRouter.createCaller(ctx(...args));
}

function mirrorRow(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_A,
    spreadsheetId: "sheet-1",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
    sharedWith: "shop@example.com",
    stockInEnabled: false,
    lastSyncedAt: new Date("2026-08-17T08:00:00Z"),
    lastSyncError: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sheetsMock.isSheetsConfigured.mockReturnValue(true);
  dbMock.getSheetMirror.mockResolvedValue(null);
  dbMock.getTenantById.mockResolvedValue({ id: TENANT_A, name: "Acme Jewels" });
  mirrorMock.connectSheetMirror.mockResolvedValue({
    spreadsheetId: "sheet-new",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-new/edit",
  });
  mirrorMock.syncSheetMirror.mockResolvedValue({
    status: "synced",
    salesRows: 4,
    inventoryRows: 2,
    stockInPending: false,
  });
});

describe("authorization", () => {
  it("refuses an anonymous caller", async () => {
    await expect(caller(null).status()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a staff member", async () => {
    await expect(caller("staff").status()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses an anonymous connect", async () => {
    await expect(
      caller(null).connect({ shareWith: "a@b.com" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mirrorMock.connectSheetMirror).not.toHaveBeenCalled();
  });

  it("acts on the CALLER's store, never the host's, for an admin of another tenant", async () => {
    // Admin of B, browsing A's subdomain.
    dbMock.getTenantById.mockResolvedValue({ id: TENANT_B, name: "B Store" });
    await caller("admin", TENANT_B, TENANT_A).connect({});

    expect(dbMock.getSheetMirror).toHaveBeenCalledWith(TENANT_B);
    expect(dbMock.getTenantById).toHaveBeenCalledWith(TENANT_B);
    expect(mirrorMock.connectSheetMirror).toHaveBeenCalledWith(TENANT_B, {
      storeName: "B Store",
      // B's own admin, from B's own session — never anything belonging to A.
      shareWith: "admin@example.com",
      stockInEnabled: false,
    });
    // Store A is untouched, and its name never reaches B's spreadsheet title.
    expect(dbMock.getSheetMirror).not.toHaveBeenCalledWith(TENANT_A);
    expect(mirrorMock.connectSheetMirror).not.toHaveBeenCalledWith(
      TENANT_A,
      expect.anything(),
    );
  });

  it("reads only the caller's own mirror on every other route", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow({ tenantId: TENANT_B }));
    const c = caller("admin", TENANT_B, TENANT_A);

    await c.status();
    await c.syncNow();
    await c.setStockIn({ enabled: true });
    await c.disconnect();

    for (const call of dbMock.getSheetMirror.mock.calls) {
      expect(call[0]).toBe(TENANT_B);
    }
    expect(mirrorMock.syncSheetMirror).toHaveBeenCalledWith(TENANT_B);
    expect(mirrorMock.setStockInEnabled).toHaveBeenCalledWith(TENANT_B, true);
    expect(mirrorMock.disconnectSheetMirror).toHaveBeenCalledWith(TENANT_B);
  });
});

describe("status", () => {
  it("reports the feature absent when the platform has no credentials", async () => {
    sheetsMock.isSheetsConfigured.mockReturnValue(false);
    const res = await caller().status();
    expect(res).toEqual({
      configured: false,
      googleAccount: "admin@example.com",
      mirror: null,
    });
  });

  it("reports the Google address a Google sign-in already gave us", async () => {
    expect((await caller().status()).googleAccount).toBe("admin@example.com");
  });

  /**
   * Drive can only share to a Google account, and an Apple or magic-link
   * address very often isn't one — so the UI has to ask rather than guess.
   */
  it("reports no Google address for a non-Google sign-in", async () => {
    expect(
      (await caller("admin", TENANT_A, TENANT_A, "apple").status())
        .googleAccount,
    ).toBeNull();
    expect(
      (await caller("admin", TENANT_A, TENANT_A, "magic_link").status())
        .googleAccount,
    ).toBeNull();
  });

  it("reports no Google address when a Google sign-in somehow has no email", async () => {
    expect(
      (await caller("admin", TENANT_A, TENANT_A, "google", null).status())
        .googleAccount,
    ).toBeNull();
  });

  it("returns the URL and sync state, but never the spreadsheet id", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    const res = await caller().status();
    expect(res.mirror).toEqual({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
      sharedWith: "shop@example.com",
      stockInEnabled: false,
      lastSyncedAt: "2026-08-17T08:00:00.000Z",
      lastSyncError: null,
    });
    // The file's id is deliberately not returned: the admin only ever needs
    // the URL to click, and the id is the handle every Sheets API call keys on.
    expect(res.mirror).not.toHaveProperty("spreadsheetId");
  });

  it("surfaces the last failure so the merchant can fix what only they can", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ lastSyncError: "File not found: sheet-1" }),
    );
    const res = await caller().status();
    expect(res.mirror?.lastSyncError).toBe("File not found: sheet-1");
  });

  it("reports a never-synced mirror as null rather than a date", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow({ lastSyncedAt: null }));
    expect((await caller().status()).mirror?.lastSyncedAt).toBeNull();
  });
});

describe("connect", () => {
  it("refuses when the installation has no Google credentials", async () => {
    sheetsMock.isSheetsConfigured.mockReturnValue(false);
    await expect(caller().connect({})).rejects.toThrow(/not configured/i);
    expect(mirrorMock.connectSheetMirror).not.toHaveBeenCalled();
  });

  it("rejects a share address that is not an email", async () => {
    await expect(
      caller("admin", TENANT_A, TENANT_A, "apple").connect({
        shareWith: "not-an-email",
      }),
    ).rejects.toThrow();
    expect(mirrorMock.connectSheetMirror).not.toHaveBeenCalled();
  });

  it("refuses a second mirror for the same store", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    await expect(caller().connect({})).rejects.toThrow(/already has/i);
    expect(mirrorMock.connectSheetMirror).not.toHaveBeenCalled();
  });

  // ─── Where the share address comes from ────────────────────────────────────

  it("shares with the Google account the admin signed in as, with no input", async () => {
    await caller().connect({});
    expect(mirrorMock.connectSheetMirror).toHaveBeenCalledWith(TENANT_A, {
      storeName: "Acme Jewels",
      shareWith: "admin@example.com",
      stockInEnabled: false,
    });
  });

  /**
   * The tightening this change buys: with the address taken from the session,
   * an admin cannot point a store's whole ledger at a third party by typing a
   * different one into the request.
   */
  it("ignores a supplied address when the session already has a Google one", async () => {
    await caller().connect({ shareWith: "somebody-else@example.com" });
    expect(mirrorMock.connectSheetMirror.mock.calls[0][1].shareWith).toBe(
      "admin@example.com",
    );
  });

  it("uses the supplied address for a non-Google sign-in", async () => {
    await caller("admin", TENANT_A, TENANT_A, "magic_link").connect({
      shareWith: "shop@gmail.com",
    });
    expect(mirrorMock.connectSheetMirror.mock.calls[0][1].shareWith).toBe(
      "shop@gmail.com",
    );
  });

  it("refuses a non-Google sign-in that supplies no address", async () => {
    await expect(
      caller("admin", TENANT_A, TENANT_A, "apple").connect({}),
    ).rejects.toThrow(/which Google account/i);
    expect(mirrorMock.connectSheetMirror).not.toHaveBeenCalled();
  });

  it("titles the spreadsheet with the caller's own store name", async () => {
    await caller().connect({});
    expect(mirrorMock.connectSheetMirror.mock.calls[0][1].storeName).toBe(
      "Acme Jewels",
    );
  });

  it("falls back to a neutral title when the tenant row is missing", async () => {
    dbMock.getTenantById.mockResolvedValue(undefined);
    await caller().connect({});
    expect(mirrorMock.connectSheetMirror.mock.calls[0][1].storeName).toBe(
      `Store ${TENANT_A}`,
    );
  });

  it("defaults the inbound lane to OFF", async () => {
    await caller().connect({});
    expect(mirrorMock.connectSheetMirror.mock.calls[0][1].stockInEnabled).toBe(
      false,
    );
  });

  it("audit-logs who shared the ledger, where it went, and how that was decided", async () => {
    await caller().connect({ stockInEnabled: true });
    expect(dbMock.insertAuditLog).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      userId: 42,
      action: "sheets.connected",
      resourceType: "sheet_mirror",
      metadata: {
        sharedWith: "admin@example.com",
        shareTargetSource: "google_signin",
        stockInEnabled: true,
      },
    });
  });

  it("records a typed address as such, since only that can point elsewhere", async () => {
    await caller("admin", TENANT_A, TENANT_A, "apple").connect({
      shareWith: "shop@gmail.com",
    });
    expect(dbMock.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          sharedWith: "shop@gmail.com",
          shareTargetSource: "entered",
        }),
      }),
    );
  });

  it("returns the link to open", async () => {
    const res = await caller().connect({});
    expect(res).toEqual({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-new/edit",
    });
  });
});

describe("syncNow", () => {
  it("refuses when the store has no mirror", async () => {
    await expect(caller().syncNow()).rejects.toThrow(/no spreadsheet mirror/i);
    expect(mirrorMock.syncSheetMirror).not.toHaveBeenCalled();
  });

  it("returns the sync summary", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    expect(await caller().syncNow()).toEqual({
      status: "synced",
      salesRows: 4,
      inventoryRows: 2,
      stockInPending: false,
    });
  });

  it("reports a pending Stock In tab rather than silently skipping it", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: true }),
    );
    mirrorMock.syncSheetMirror.mockResolvedValue({
      status: "synced",
      salesRows: 4,
      inventoryRows: 2,
      stockInPending: true,
    });
    expect((await caller().syncNow()).stockInPending).toBe(true);
  });

  it("maps a Google failure to a gateway error carrying the reason", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    mirrorMock.syncSheetMirror.mockRejectedValue(new Error("quota exhausted"));
    await expect(caller().syncNow()).rejects.toThrow("quota exhausted");
  });
});

describe("setStockIn", () => {
  it("refuses when the store has no mirror", async () => {
    await expect(caller().setStockIn({ enabled: true })).rejects.toThrow(
      /no spreadsheet mirror/i,
    );
    expect(mirrorMock.setStockInEnabled).not.toHaveBeenCalled();
  });

  it("turns the lane on and audit-logs the permission change", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    expect(await caller().setStockIn({ enabled: true })).toEqual({
      stockInEnabled: true,
    });
    expect(mirrorMock.setStockInEnabled).toHaveBeenCalledWith(TENANT_A, true);
    expect(dbMock.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sheets.stockIn.on", userId: 42 }),
    );
  });

  it("turns it off again under its own action name", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: true }),
    );
    await caller().setStockIn({ enabled: false });
    expect(mirrorMock.setStockInEnabled).toHaveBeenCalledWith(TENANT_A, false);
    expect(dbMock.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sheets.stockIn.off" }),
    );
  });
});

describe("disconnect", () => {
  it("is idempotent for a store with no mirror", async () => {
    expect(await caller().disconnect()).toEqual({ disconnected: false });
    expect(mirrorMock.disconnectSheetMirror).not.toHaveBeenCalled();
    expect(dbMock.insertAuditLog).not.toHaveBeenCalled();
  });

  it("disconnects and audit-logs where the file had been shared", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    expect(await caller().disconnect()).toEqual({ disconnected: true });
    expect(mirrorMock.disconnectSheetMirror).toHaveBeenCalledWith(TENANT_A);
    expect(dbMock.insertAuditLog).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      userId: 42,
      action: "sheets.disconnected",
      resourceType: "sheet_mirror",
      metadata: { sharedWith: "shop@example.com" },
    });
  });

  /**
   * Deliberately NOT gated on isSheetsConfigured: if the credentials were
   * removed from the installation, a merchant must still be able to detach a
   * mirror they can no longer refresh.
   */
  it("still works when the credentials have been removed", async () => {
    sheetsMock.isSheetsConfigured.mockReturnValue(false);
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    expect(await caller().disconnect()).toEqual({ disconnected: true });
  });
});
