import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import { getTenantById } from "../db";
import { getStripe, isStripeConfigured } from "../stripe";
import {
  CSV_MIGRATION_PROVIDERS,
  mapStripeProducts,
  parseProviderCsv,
  type StripeCatalogProduct,
} from "../providerMigration";
import { connectConfigStatus } from "../stripeConnect";

// Migrating a catalogue off Stripe/SumUp/Worldline writes only to the
// caller's OWN store, so every procedure scopes through ctx.user.tenantId and
// never touches ctx.tenant — the bare-adminProcedure shape products.ts and
// instagram.ts use (see CLAUDE.md's authorization table).
//
// Nothing here writes products: parsing/fetching returns rows for the import
// preview, and the actual write goes through products.csvImport so migration
// shares its category validation and upsert-by-name dedupe.

/** More products than any small merchant has; bounds the Stripe pagination. */
const STRIPE_CATALOG_LIMIT = 1000;

export const migrationRouter = router({
  /**
   * What the "switch to Gwinn" UI can offer this store right now — whether
   * the one-click Stripe catalogue import is available (their Stripe account
   * already linked via Connect), connectable, or unavailable on this deploy.
   */
  status: adminProcedure.query(async ({ ctx }) => {
    const tenant = await getTenantById(ctx.user.tenantId);
    return {
      stripe: {
        connected: Boolean(tenant?.stripeConnectedAccountId),
        // Connecting requires both the platform key and Connect OAuth config.
        connectAvailable:
          isStripeConfigured() && connectConfigStatus().configured,
      },
      csvProviders: CSV_MIGRATION_PROVIDERS,
    };
  }),

  /**
   * Parse an uploaded SumUp / Worldline / generic CSV export into normalized
   * rows for the import preview. Pure server-side parsing (no writes) so the
   * provider quirks live in one tested place, not in the browser.
   */
  parseProviderCsv: adminProcedure
    .input(
      z.object({
        provider: z.enum(CSV_MIGRATION_PROVIDERS),
        // Same ceiling as products.fetchSheetCsv's response guard.
        csv: z.string().min(1).max(2_000_000),
      }),
    )
    .mutation(({ input }) => parseProviderCsv(input.provider, input.csv)),

  /**
   * Read the tenant's existing product catalogue straight off the Stripe
   * account they linked via Connect — the same link that keeps their checkout
   * working — and return it as import-preview rows. Read-only on both sides.
   */
  fetchStripeCatalog: adminProcedure.mutation(async ({ ctx }) => {
    const tenant = await getTenantById(ctx.user.tenantId);
    const accountId = tenant?.stripeConnectedAccountId;
    if (!accountId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Connect your existing Stripe account first — then your catalogue can be imported in one click.",
      });
    }
    const stripe = getStripe();
    if (!stripe) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Stripe is not configured on this deployment.",
      });
    }

    const products: StripeCatalogProduct[] = [];
    let startingAfter: string | undefined;
    try {
      while (products.length < STRIPE_CATALOG_LIMIT) {
        const page = await stripe.products.list(
          {
            active: true,
            limit: 100,
            expand: ["data.default_price"],
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          },
          // Runs on the tenant's own connected account, not the platform's.
          { stripeAccount: accountId },
        );
        products.push(...(page.data as unknown as StripeCatalogProduct[]));
        if (!page.has_more || page.data.length === 0) break;
        startingAfter = page.data[page.data.length - 1].id;
      }
    } catch (err) {
      console.error(
        `[Migration] Stripe catalogue fetch failed for tenant ${ctx.user.tenantId}:`,
        err,
      );
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message:
          "Stripe did not return your catalogue — try again in a moment, or re-connect your Stripe account.",
      });
    }

    const result = mapStripeProducts(products);
    if (products.length >= STRIPE_CATALOG_LIMIT) {
      result.warnings.push(
        `Only the first ${STRIPE_CATALOG_LIMIT} Stripe products were fetched — contact support if your catalogue is larger.`,
      );
    }
    return result;
  }),
});
