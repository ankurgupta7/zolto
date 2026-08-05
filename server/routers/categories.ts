import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router, tenantAdminProcedure } from "../_core/trpc";
import {
  countProductsInCategory,
  createTenantCategoryRow,
  deleteTenantCategoryRow,
  getTenantCategories,
  getTenantSettings,
  renameTenantCategoryKey,
  reorderTenantCategories,
  seedTenantCategories,
  updateTenantCategoryLabels,
} from "../db";
import { assertTenantCategory } from "../verticals";
import {
  FALLBACK_CATEGORY_KEY,
  VERTICAL_PRESETS,
  isVertical,
} from "@shared/verticals";

// Keys become LLM json_schema enum values, URL query params, and POS payload
// entries, so keep them to letters/digits plus a few joiners — no quotes,
// backslashes, or leading/trailing punctuation.
const categoryKeySchema = z.string().trim().min(1).max(64).regex(
  // Built via the constructor because the tsconfig target predates literal
  // `u`-flag support; the runtime understands it fine.
  new RegExp("^[\\p{L}\\p{N}][\\p{L}\\p{N} &'\\-/]*$", "u"),
  "Category names may only contain letters, digits, spaces, &, ', - and /",
);

const labelSchema = z.string().trim().min(1).max(64);

async function requireCategory(tenantId: number, key: string) {
  const rows = await getTenantCategories(tenantId);
  const row = rows.find((c) => c.key === key);
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Category "${key}" not found`,
    });
  }
  return { rows, row };
}

export const categoriesRouter = router({
  /**
   * Public: the store's categories in display order. The storefront filter
   * chips, footer links, and admin selects all render from this — the
   * category vocabulary is per-tenant, not global.
   */
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.tenant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
    }
    const rows = await getTenantCategories(ctx.tenant.id);
    return rows.map((c) => ({
      key: c.key,
      labelEn: c.labelEn,
      labelDe: c.labelDe,
      labelFr: c.labelFr,
      labelIt: c.labelIt,
      extraIncludes: c.extraIncludes ?? [],
      sortOrder: c.sortOrder,
    }));
  }),

  // Admin: add a category. The key doubles as the English label unless one
  // is given explicitly.
  create: tenantAdminProcedure
    .input(
      z.object({
        key: categoryKeySchema,
        labelEn: labelSchema.optional(),
        labelDe: labelSchema.optional(),
        labelFr: labelSchema.optional(),
        labelIt: labelSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getTenantCategories(ctx.tenant.id);
      if (existing.some((c) => c.key === input.key)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Category "${input.key}" already exists`,
        });
      }
      await createTenantCategoryRow({
        tenantId: ctx.tenant.id,
        key: input.key,
        labelEn: input.labelEn ?? input.key,
        labelDe: input.labelDe ?? null,
        labelFr: input.labelFr ?? null,
        labelIt: input.labelIt ?? null,
      });
      return { success: true } as const;
    }),

  // Admin: rename a category's labels and/or its key. A key rename cascades
  // to every product in the category and any sibling folding rules, in one
  // transaction.
  update: tenantAdminProcedure
    .input(
      z.object({
        key: categoryKeySchema,
        newKey: categoryKeySchema.optional(),
        labelEn: labelSchema.optional(),
        labelDe: labelSchema.nullable().optional(),
        labelFr: labelSchema.nullable().optional(),
        labelIt: labelSchema.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { rows } = await requireCategory(ctx.tenant.id, input.key);
      if (input.newKey && input.newKey !== input.key) {
        if (input.key === FALLBACK_CATEGORY_KEY) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `The "${FALLBACK_CATEGORY_KEY}" category cannot be renamed — AI extraction falls back to it`,
          });
        }
        if (rows.some((c) => c.key === input.newKey)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Category "${input.newKey}" already exists`,
          });
        }
        await renameTenantCategoryKey(ctx.tenant.id, input.key, input.newKey);
      }
      if (
        input.labelEn !== undefined ||
        input.labelDe !== undefined ||
        input.labelFr !== undefined ||
        input.labelIt !== undefined
      ) {
        await updateTenantCategoryLabels(
          ctx.tenant.id,
          input.newKey ?? input.key,
          {
            ...(input.labelEn !== undefined ? { labelEn: input.labelEn } : {}),
            ...(input.labelDe !== undefined ? { labelDe: input.labelDe } : {}),
            ...(input.labelFr !== undefined ? { labelFr: input.labelFr } : {}),
            ...(input.labelIt !== undefined ? { labelIt: input.labelIt } : {}),
          },
        );
      }
      return { success: true } as const;
    }),

  // Admin: delete a category. Products in it move to `reassignTo`, which the
  // caller must name when any exist — no silent data loss.
  remove: tenantAdminProcedure
    .input(
      z.object({
        key: categoryKeySchema,
        reassignTo: categoryKeySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.key === FALLBACK_CATEGORY_KEY) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `The "${FALLBACK_CATEGORY_KEY}" category cannot be deleted — AI extraction falls back to it`,
        });
      }
      await requireCategory(ctx.tenant.id, input.key);
      const productCount = await countProductsInCategory(
        ctx.tenant.id,
        input.key,
      );
      let reassignTo = input.reassignTo ?? FALLBACK_CATEGORY_KEY;
      if (productCount > 0) {
        if (!input.reassignTo) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Category "${input.key}" still has ${productCount} product(s) — pass reassignTo to move them`,
          });
        }
        if (input.reassignTo === input.key) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot reassign products to the category being deleted",
          });
        }
        await assertTenantCategory(ctx.tenant.id, input.reassignTo);
        reassignTo = input.reassignTo;
      }
      await deleteTenantCategoryRow(ctx.tenant.id, input.key, reassignTo);
      return { success: true, reassigned: productCount } as const;
    }),

  // Admin: reorder categories; `keys` lists every key in the desired order.
  reorder: tenantAdminProcedure
    .input(z.object({ keys: z.array(categoryKeySchema).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await getTenantCategories(ctx.tenant.id);
      const valid = new Set(rows.map((c) => c.key));
      const unknown = input.keys.filter((k) => !valid.has(k));
      if (unknown.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown categories: ${unknown.join(", ")}`,
        });
      }
      await reorderTenantCategories(ctx.tenant.id, input.keys);
      return { success: true } as const;
    }),

  // Admin: re-apply the tenant's vertical preset, adding any preset
  // categories they don't have. Non-destructive — never removes or renames.
  applyPreset: tenantAdminProcedure.mutation(async ({ ctx }) => {
    const settings = await getTenantSettings(ctx.tenant.id);
    const vertical =
      settings?.vertical && isVertical(settings.vertical)
        ? settings.vertical
        : "jewellery";
    await seedTenantCategories(ctx.tenant.id, vertical);
    return {
      success: true,
      vertical,
      preset: VERTICAL_PRESETS[vertical].categories.map((c) => c.key),
    } as const;
  }),
});
