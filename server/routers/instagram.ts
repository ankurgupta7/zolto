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

export const instagramRouter = router({
  list: publicProcedure.query(async () => {
    return getInstagramPosts();
  }),

  add: adminProcedure
    .input(
      z.object({
        postUrl: z.string().url(),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ input }) => {
      if (!input.postUrl.includes("instagram.com/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "URL must be an Instagram URL (instagram.com/p/..., /reel/..., or /tv/...)",
        });
      }
      await addInstagramPost(input.postUrl, input.sortOrder);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteInstagramPost(input.id);
      return { success: true };
    }),

  reorder: adminProcedure
    .input(z.object({ id: z.number().int(), sortOrder: z.number().int() }))
    .mutation(async ({ input }) => {
      await reorderInstagramPost(input.id, input.sortOrder);
      return { success: true };
    }),
});
