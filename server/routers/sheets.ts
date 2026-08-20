/**
 * Sheets — the merchant's spreadsheet mirror, connected and controlled.
 *
 * Lane 1 (outbound) is `connect` / `syncNow` / `disconnect`: a Google Sheet the
 * store can filter, pivot and hand to an accountant, refreshed from the ledger.
 * Lane 2 (inbound) is `setStockIn`, which widens the merchant's Drive grant so
 * they can type restocks into one protected tab — the diff-and-approve half
 * lives in server/routers/stockIn.ts.
 *
 * `adminProcedure`, not `tenantAdminProcedure`: every read and write below is
 * scoped through `ctx.user.tenantId` — the caller's OWN store — and nothing here
 * touches `ctx.tenant`, the host-derived store. That is the shape CLAUDE.md
 * documents as safe for a bare `adminProcedure`, and the shape products.ts and
 * instagram.ts already use. Note in particular that the spreadsheet's title
 * comes from `getTenantById(ctx.user.tenantId)` rather than from `ctx.tenant.name`:
 * reading the ambient tenant would put another store's name on this store's file
 * whenever an admin happened to be browsing a different subdomain.
 *
 * ## Who the sheet gets shared with
 *
 * Gwinn owns the file; the merchant is a Drive collaborator on it. The address
 * we share to is therefore an identity question, and the answer is already in
 * the session: an admin who signed in with Google (`loginMethod === "google"`)
 * has told us their Google address, so `connect` uses it and asks for nothing.
 * That is both less typing and tighter than the alternative — with no field to
 * fill in, the normal flow can only ever share a store's ledger with the person
 * already signed in to it.
 *
 * The fallback exists because Drive can only share to a GOOGLE account, and
 * signing in by Apple or magic link tells us nothing about whether the address
 * is one. Those admins are asked for a Google address explicitly.
 *
 * Either way it is durable and outward-facing, so `connect` and `disconnect`
 * are audit-logged with who did it and where the file went.
 */

import { BRAND } from "@shared/brand";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getSheetMirror, getTenantById, insertAuditLog } from "../db";
import { isSheetsConfigured } from "../googleSheets";
import {
  connectSheetMirror,
  disconnectSheetMirror,
  setStockInEnabled,
  syncSheetMirror,
} from "../sheetMirror";

/** Shared by every mutation: refuse early when the platform has no credentials. */
function assertConfigured(): void {
  if (isSheetsConfigured()) return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Google Sheets is not configured for this installation (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY).",
  });
}

/**
 * The Google address this caller's own sign-in gives us, or null when their
 * sign-in method tells us nothing usable.
 *
 * Deliberately gated on `loginMethod`, not just on a non-empty `email`: a
 * magic-link or Apple account's address is very often not a Google account, and
 * sharing a Drive file at a non-Google address produces an invite the merchant
 * may never be able to accept — a silent half-connected state, which is worse
 * than asking them one question.
 */
function googleAccountFromSession(user: {
  email: string | null;
  loginMethod: string | null;
}): string | null {
  if (user.loginMethod !== "google") return null;
  const email = user.email?.trim();
  return email ? email : null;
}

async function requireMirror(tenantId: number) {
  const mirror = await getSheetMirror(tenantId);
  if (!mirror) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This store has no spreadsheet mirror yet.",
    });
  }
  return mirror;
}

export const sheetsRouter = router({
  /**
   * What the admin page renders. `configured: false` means the feature is
   * absent from this installation (every self-hosted one, by default) rather
   * than broken, and the UI says so instead of offering a button that cannot
   * work.
   */
  status: adminProcedure.query(async ({ ctx }) => {
    const mirror = await getSheetMirror(ctx.user.tenantId);
    return {
      configured: isSheetsConfigured(),
      /**
       * The Google address this admin's sign-in already gives us, so the UI can
       * say who the sheet will be shared with instead of asking. Null means we
       * have to ask — see googleAccountFromSession.
       */
      googleAccount: googleAccountFromSession(ctx.user),
      mirror: mirror
        ? {
            spreadsheetUrl: mirror.spreadsheetUrl,
            sharedWith: mirror.sharedWith,
            stockInEnabled: mirror.stockInEnabled,
            lastSyncedAt: mirror.lastSyncedAt?.toISOString() ?? null,
            lastSyncError: mirror.lastSyncError,
          }
        : null,
      // Deliberately NOT the spreadsheet id: it is the file's capability-ish
      // handle, and the admin only ever needs the URL to click.
    };
  }),

  connect: adminProcedure
    .input(
      z.object({
        /**
         * Only needed by an admin whose sign-in gives us no Google address
         * (Apple, magic link). Omitted in the normal Google-sign-in flow, where
         * the server uses the session's own identity instead — so there is no
         * field for a typo, and no field to point somewhere else either.
         */
        shareWith: z.string().email().max(320).optional(),
        /** Start with the inbound Stock In tab live. Off by default. */
        stockInEnabled: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertConfigured();
      const tenantId = ctx.user.tenantId;

      if (await getSheetMirror(tenantId)) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This store already has a spreadsheet mirror. Disconnect it first.",
        });
      }

      // Session identity first: an admin signed in with Google needs no input,
      // and cannot redirect the share by supplying one.
      const fromSession = googleAccountFromSession(ctx.user);
      const shareWith = fromSession ?? input.shareWith?.trim() ?? "";
      if (!shareWith) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Tell us which Google account to share the sheet with, or sign in to ${BRAND.name} with Google.`,
        });
      }

      const tenant = await getTenantById(tenantId);
      const created = await connectSheetMirror(tenantId, {
        storeName: tenant?.name ?? `Store ${tenantId}`,
        shareWith,
        stockInEnabled: input.stockInEnabled,
      });

      await insertAuditLog({
        tenantId,
        userId: ctx.user.id,
        action: "sheets.connected",
        resourceType: "sheet_mirror",
        metadata: {
          sharedWith: shareWith,
          // Whether the address came from the session or was typed in — worth
          // recording, since only the latter can point at someone else.
          shareTargetSource: fromSession ? "google_signin" : "entered",
          stockInEnabled: input.stockInEnabled,
        },
      });

      return { spreadsheetUrl: created.spreadsheetUrl };
    }),

  /**
   * Refresh on demand. The scheduled sweep already keeps every mirror current;
   * this exists because a merchant who just changed a price wants to see it in
   * the sheet now, not at the top of the hour.
   */
  syncNow: adminProcedure.mutation(async ({ ctx }) => {
    assertConfigured();
    await requireMirror(ctx.user.tenantId);
    try {
      const result = await syncSheetMirror(ctx.user.tenantId);
      return result;
    } catch (err) {
      // The reason is already recorded on the mirror row (and rendered by
      // `status`), so this only needs to fail the button rather than explain.
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: err instanceof Error ? err.message : "Sheet sync failed",
      });
    }
  }),

  /**
   * Turn the inbound lane on or off. This changes the merchant's Drive role, so
   * it is a permission change, not a preference — hence the audit entry.
   */
  setStockIn: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertConfigured();
      await requireMirror(ctx.user.tenantId);
      await setStockInEnabled(ctx.user.tenantId, input.enabled);
      await insertAuditLog({
        tenantId: ctx.user.tenantId,
        userId: ctx.user.id,
        action: input.enabled ? "sheets.stockIn.on" : "sheets.stockIn.off",
        resourceType: "sheet_mirror",
      });
      return { stockInEnabled: input.enabled };
    }),

  disconnect: adminProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const mirror = await getSheetMirror(tenantId);
    // Idempotent: a merchant pressing Disconnect twice should not see an error.
    if (!mirror) return { disconnected: false };

    await disconnectSheetMirror(tenantId);
    await insertAuditLog({
      tenantId,
      userId: ctx.user.id,
      action: "sheets.disconnected",
      resourceType: "sheet_mirror",
      metadata: { sharedWith: mirror.sharedWith },
    });
    return { disconnected: true };
  }),
});
