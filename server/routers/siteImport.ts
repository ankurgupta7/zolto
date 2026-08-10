/**
 * The paid one-time switch-in: read a merchant's existing shop and move it here.
 *
 * The pricing model is the shape of this router. `preview` crawls and extracts
 * for free and shows the merchant exactly what was found; `startCheckout` asks
 * for CHF 20 once; `apply` writes — and refuses to write anything until Stripe
 * has said the money arrived. Nobody pays for a crawl that came back empty,
 * which is what makes charging for this defensible at all (shared/platform.ts
 * SITE_IMPORT states the promise it lives under).
 *
 * Authorization: every procedure is bare `adminProcedure` scoped entirely
 * through `ctx.user.tenantId` and never touches `ctx.tenant` — the shape
 * CLAUDE.md's table names as the correct use of it, and the same shape
 * routers/migration.ts (the CSV switch-in) already uses. The request's host
 * never decides whose catalogue gets written.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import { SITE_IMPORT } from "@shared/platform";
import { FALLBACK_CATEGORY_KEY } from "@shared/verticals";
import {
  createProduct,
  createSiteImport,
  createTenantCategoryRow,
  getAllProducts,
  getLatestSiteImportForTenant,
  getSiteImportForTenant,
  getTenantById,
  getTenantCategories,
  markSiteImportApplied,
  markSiteImportFailed,
  setSiteImportCheckoutSession,
  updateProduct,
  upsertTenantSettingsFields,
} from "../db";
import { createSiteImportCheckoutSession } from "../billing";
import { isStripeConfigured } from "../stripe";
import { createRateLimiter } from "../rateLimit";
import { crawlSite } from "../siteCrawler";
import {
  extractPage,
  mergeExtractions,
  type ExtractedProduct,
  type SiteExtraction,
} from "../siteImport";

/**
 * A crawl spends a minute of machine time and up to sixty requests against
 * someone else's server, and it is free — so it is the one thing here that
 * needs a ceiling. Per tenant, not per IP: two merchants sharing an office
 * network are not each other's problem. Generous enough to try a few entry
 * points (the shop root, then a category page) in one sitting.
 */
const previewLimiter = createRateLimiter({
  limit: 8,
  windowMs: 60 * 60 * 1000,
});

/** Test seam: drop the shared rate-limit windows between cases. */
export async function resetSiteImportRateLimits(): Promise<void> {
  await previewLimiter.reset();
}

/** Matches products.csvImport's ceiling, so both intake paths behave alike. */
const MAX_IMPORT_PRODUCTS = 500;

/** The same shape categories.create validates a key against. */
const CATEGORY_KEY = new RegExp("^[\\p{L}\\p{N}][\\p{L}\\p{N} &'\\-/]*$", "u");

/**
 * Turn a source site's own category text into a Zolto category key, or null
 * when it can't be one. Punctuation-heavy breadcrumbs ("Shop » Mugs (new!)")
 * are dropped rather than mangled — a category the merchant doesn't recognise
 * is worse than one we didn't create.
 */
export function categoryKeyFrom(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ").slice(0, 64);
  if (!trimmed || !CATEGORY_KEY.test(trimmed)) return null;
  return trimmed;
}

/** What the merchant is shown before paying, and what `apply` later writes. */
function summarise(extraction: SiteExtraction) {
  const profile = extraction.profile;
  return {
    productCount: extraction.products.length,
    /** Products carrying a price we could read — the ones that can go live. */
    pricedCount: extraction.products.filter((p) => p.price !== null).length,
    withPhoto: extraction.products.filter((p) => p.imageUrl).length,
    categories: extraction.categories,
    profile,
    warnings: extraction.warnings,
    /** Which of the optional pieces are actually there to apply. */
    has: {
      logo: Boolean(profile.logoUrl),
      brandColour: Boolean(profile.primaryColor),
      shopProfile: Boolean(
        profile.storeName || profile.about || profile.email || profile.phone,
      ),
      categories: extraction.categories.length > 0,
    },
  };
}

function loadExtraction(raw: unknown): SiteExtraction {
  const value = raw as Partial<SiteExtraction> | null;
  return {
    products: Array.isArray(value?.products) ? value.products : [],
    profile: value?.profile ?? {},
    categories: Array.isArray(value?.categories) ? value.categories : [],
    warnings: Array.isArray(value?.warnings) ? value.warnings : [],
  };
}

export const siteImportRouter = router({
  /**
   * What this store can do with the importer right now — the marketing copy
   * (single-sourced from shared/platform.ts, so the admin page and the pricing
   * page can never disagree about the price), whether a payment can be taken
   * on this deployment, and the merchant's most recent attempt so a browser
   * closed at the Stripe page can be picked back up.
   */
  status: adminProcedure.query(async ({ ctx }) => {
    const tenant = await getTenantById(ctx.user.tenantId);
    const latest = await getLatestSiteImportForTenant(ctx.user.tenantId);
    return {
      offer: SITE_IMPORT,
      // A self-hosted deploy with no Stripe keys can still preview; it just
      // cannot take the payment, and saying so beats a dead Pay button.
      checkoutAvailable:
        isStripeConfigured() && Boolean(tenant?.stripeCustomerId),
      latest: latest
        ? {
            id: latest.id,
            sourceUrl: latest.sourceUrl,
            status: latest.status,
            productCount: latest.productCount,
            createdAt: latest.createdAt,
          }
        : null,
    };
  }),

  /**
   * Free: crawl the merchant's existing shop and show them what we found.
   *
   * The extraction is stored with the row, not re-derived after payment: a page
   * edited or a product sold out between preview and apply would otherwise mean
   * the merchant paid for one result and received another.
   */
  preview: adminProcedure
    .input(
      z.object({
        url: z
          .string()
          .trim()
          .min(1)
          .max(1024)
          .refine(
            (value) => {
              try {
                const parsed = new URL(value);
                return (
                  parsed.protocol === "https:" || parsed.protocol === "http:"
                );
              } catch {
                return false;
              }
            },
            { message: "Enter a full web address, like https://yourshop.ch" },
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const limit = await previewLimiter.check(
        `siteimport:${ctx.user.tenantId}`,
      );
      if (!limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `That's a lot of reading. Try again in ${Math.ceil(
            limit.retryAfterSeconds / 60,
          )} minutes.`,
        });
      }

      const crawl = await crawlSite(input.url);
      const extraction = mergeExtractions(
        crawl.pages.map((page) => extractPage(page.html, page.url)),
      );
      extraction.warnings = crawl.warnings.concat(extraction.warnings);

      if (extraction.products.length > MAX_IMPORT_PRODUCTS) {
        extraction.warnings.push(
          `We found more than ${MAX_IMPORT_PRODUCTS} products and will import the first ${MAX_IMPORT_PRODUCTS}. Run the import again from a category page to pick up the rest.`,
        );
        extraction.products = extraction.products.slice(0, MAX_IMPORT_PRODUCTS);
      }
      if (crawl.pages.length === 0) {
        extraction.warnings.push(
          "We couldn't reach that address at all. Check the spelling, and that the site is publicly online.",
        );
      }

      const id = await createSiteImport({
        tenantId: ctx.user.tenantId,
        sourceUrl: input.url,
        extraction,
        productCount: extraction.products.length,
      });

      return {
        importId: id,
        pagesRead: crawl.pages.length,
        priceChf: SITE_IMPORT.priceChf,
        ...summarise(extraction),
        // The full list, because the merchant is deciding whether it's worth
        // CHF 20 — a count alone asks them to buy something they can't see.
        products: extraction.products,
      };
    }),

  /** Re-open a preview the merchant already ran (after a Stripe round-trip). */
  get: adminProcedure
    .input(z.object({ importId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getSiteImportForTenant(
        ctx.user.tenantId,
        input.importId,
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Import not found" });
      }
      const extraction = loadExtraction(row.extraction);
      return {
        importId: row.id,
        sourceUrl: row.sourceUrl,
        status: row.status,
        priceChf: SITE_IMPORT.priceChf,
        ...summarise(extraction),
        products: extraction.products,
      };
    }),

  /**
   * Ask for the CHF 20. Returns a Stripe Checkout URL; the payment itself is
   * confirmed by the webhook (server/billing.ts), never by the browser coming
   * back to the success URL — a merchant can navigate to that URL themselves.
   */
  startCheckout: adminProcedure
    .input(z.object({ importId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await getSiteImportForTenant(
        ctx.user.tenantId,
        input.importId,
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Import not found" });
      }
      if (row.status !== "previewed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            row.status === "failed"
              ? "That import didn't complete. Run the preview again."
              : "You've already paid for this import.",
        });
      }
      const extraction = loadExtraction(row.extraction);
      if (
        extraction.products.length === 0 &&
        extraction.categories.length === 0 &&
        Object.keys(extraction.profile).length === 0
      ) {
        // The whole promise is that a thin result costs nothing. Refusing the
        // payment is the enforcement of it, not just the copy around it.
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "There's nothing here worth charging you for — we couldn't read anything from that site.",
        });
      }

      const tenant = await getTenantById(ctx.user.tenantId);
      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }
      const session = await createSiteImportCheckoutSession({
        tenant,
        siteImportId: row.id,
        priceChf: SITE_IMPORT.priceChf,
        productCount: extraction.products.length,
        req: ctx.req,
      });
      await setSiteImportCheckoutSession(
        ctx.user.tenantId,
        row.id,
        session.sessionId,
      );
      return { url: session.url };
    }),

  /**
   * Write the import into the store. Only a row Stripe has marked `paid` can
   * get here, and only once: markSiteImportApplied is claimed BEFORE any write,
   * so two tabs hitting Import produce one catalogue and one refusal rather
   * than two copies of every product.
   */
  applyImport: adminProcedure
    .input(
      z.object({
        importId: z.number().int().positive(),
        // Each optional piece is opt-out, because each one overwrites something
        // the merchant may have already set up here by hand.
        categories: z.boolean().default(true),
        branding: z.boolean().default(true),
        profile: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tid = ctx.user.tenantId;
      const row = await getSiteImportForTenant(tid, input.importId);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Import not found" });
      }
      if (row.status === "applied") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This import has already been added to your shop.",
        });
      }
      if (row.status !== "paid") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This import hasn't been paid for yet.",
        });
      }

      const claimed = await markSiteImportApplied(tid, row.id);
      if (!claimed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This import has already been added to your shop.",
        });
      }

      try {
        return await applyExtraction(
          tid,
          loadExtraction(row.extraction),
          input,
        );
      } catch (error) {
        // The row stays `applied` — re-running would duplicate the products
        // that did land. Record why for support and tell the merchant plainly.
        await markSiteImportFailed(
          tid,
          row.id,
          error instanceof Error ? error.message : String(error),
        ).catch(() => {});
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Something went wrong partway through the import. Some products may already be in your catalogue — check before running it again.",
        });
      }
    }),
});

/** The write half of `apply`, split out so it can be read (and tested) alone. */
async function applyExtraction(
  tenantId: number,
  extraction: SiteExtraction,
  want: { categories: boolean; branding: boolean; profile: boolean },
): Promise<{
  productsCreated: number;
  productsUpdated: number;
  productsFailed: string[];
  hiddenPending: number;
  categoriesCreated: string[];
  brandingApplied: boolean;
  profileApplied: boolean;
}> {
  const existingCategories = await getTenantCategories(tenantId);
  const known = new Set(existingCategories.map((c) => c.key));
  const categoriesCreated: string[] = [];

  if (want.categories) {
    for (const raw of extraction.categories) {
      const key = categoryKeyFrom(raw);
      if (!key || known.has(key)) continue;
      await createTenantCategoryRow({ tenantId, key, labelEn: key });
      known.add(key);
      categoriesCreated.push(key);
    }
  }

  // Whatever the merchant already has wins as the landing place for a product
  // whose own category we couldn't carry over.
  const fallbackCategory = known.has(FALLBACK_CATEGORY_KEY)
    ? FALLBACK_CATEGORY_KEY
    : (existingCategories[0]?.key ?? FALLBACK_CATEGORY_KEY);
  if (!known.has(fallbackCategory)) {
    await createTenantCategoryRow({
      tenantId,
      key: fallbackCategory,
      labelEn: fallbackCategory,
    });
    known.add(fallbackCategory);
    categoriesCreated.push(fallbackCategory);
  }

  // Match by name so an import that lands next to products the merchant
  // already added by hand updates them instead of shadowing each with a twin.
  const existingProducts = await getAllProducts(tenantId);
  const byName = new Map(
    existingProducts.map((p) => [p.name.trim().toLowerCase(), p]),
  );

  let productsCreated = 0;
  let productsUpdated = 0;
  let hiddenPending = 0;
  const productsFailed: string[] = [];

  for (const product of extraction.products) {
    try {
      const key = categoryKeyFrom(product.rawCategory ?? "");
      const category = key && known.has(key) ? key : fallbackCategory;
      // A product whose price we couldn't read arrives hidden. Importing it
      // visible would mean listing it at 0 — a merchant's first day on Zolto
      // must not include giving stock away because a crawler missed a number.
      const visible = product.price !== null;
      if (!visible) hiddenPending++;

      const match = byName.get(product.name.trim().toLowerCase());
      if (match) {
        await updateProduct(tenantId, match.id, {
          description: product.description || match.description,
          price: String(product.price ?? match.price),
          category,
          quantity: product.quantity,
          ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
        } as Parameters<typeof updateProduct>[2]);
        productsUpdated++;
      } else {
        await createProduct({
          tenantId,
          name: product.name,
          description: product.description || product.name,
          price: String(product.price ?? 0),
          category,
          quantity: product.quantity,
          imageUrl: product.imageUrl ?? null,
          visible,
          source: "manual",
        });
        productsCreated++;
      }
    } catch {
      productsFailed.push(product.name);
    }
  }

  const settingsPatch: Record<string, string> = {};
  if (want.branding) {
    if (extraction.profile.logoUrl) {
      settingsPatch.logoUrl = extraction.profile.logoUrl;
    }
    if (extraction.profile.primaryColor) {
      settingsPatch.primaryColor = extraction.profile.primaryColor;
    }
  }
  if (want.profile) {
    if (extraction.profile.email) {
      settingsPatch.contactEmail = extraction.profile.email;
    }
    if (extraction.profile.phone) {
      settingsPatch.contactPhone = extraction.profile.phone.slice(0, 32);
    }
    if (extraction.profile.storeName) {
      settingsPatch.metaTitle = extraction.profile.storeName.slice(0, 255);
    }
    if (extraction.profile.about) {
      settingsPatch.metaDescription = extraction.profile.about;
    }
  }
  await upsertTenantSettingsFields(tenantId, settingsPatch);

  return {
    productsCreated,
    productsUpdated,
    productsFailed,
    hiddenPending,
    categoriesCreated,
    brandingApplied: Boolean(
      settingsPatch.logoUrl || settingsPatch.primaryColor,
    ),
    profileApplied: Boolean(
      settingsPatch.contactEmail ||
      settingsPatch.contactPhone ||
      settingsPatch.metaTitle ||
      settingsPatch.metaDescription,
    ),
  };
}

export type { ExtractedProduct };
