import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import {
  getInstagramPosts,
  addInstagramPost,
  deleteInstagramPost,
  reorderInstagramPost,
} from "../db";

// ─── Instagram Posts router ─────────────────────────────────────────────────

// Storefront read scopes to the tenant resolved from the request; no tenant
// means no store, so 404 rather than leak another store's curated grid.
function storefrontTenantId(ctx: { tenant: { id: number } | null }): number {
  if (!ctx.tenant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return ctx.tenant.id;
}

export const instagramRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return getInstagramPosts(storefrontTenantId(ctx));
  }),

  add: adminProcedure
    .input(
      z.object({
        postUrl: z.string().url(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!input.postUrl.includes("instagram.com/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "URL must be an Instagram URL (instagram.com/p/..., /reel/..., or /tv/...)",
        });
      }
      await addInstagramPost(ctx.user.tenantId, input.postUrl, input.sortOrder);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await deleteInstagramPost(ctx.user.tenantId, input.id);
      return { success: true };
    }),

  reorder: adminProcedure
    .input(z.object({ id: z.number().int(), sortOrder: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await reorderInstagramPost(ctx.user.tenantId, input.id, input.sortOrder);
      return { success: true };
    }),
});
