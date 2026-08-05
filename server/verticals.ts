/**
 * Vertical-aware prompt & copy assembly.
 *
 * Every AI prompt and piece of per-tenant copy that used to hard-code
 * jewellery vocabulary builds its wording from here instead: the tenant's
 * vertical preset (shared/verticals.ts) + their actual category list
 * (tenant_categories) + their own free-text "what do you sell" description.
 */
import { TRPCError } from "@trpc/server";
import type { TenantCategory } from "../drizzle/schema";
import {
  FALLBACK_CATEGORY_KEY,
  VERTICAL_PRESETS,
  isVertical,
  type Vertical,
  type VerticalPreset,
} from "@shared/verticals";
import { getTenantCategories, getTenantSettings } from "./db";

export interface VerticalContext {
  vertical: Vertical;
  preset: VerticalPreset;
  storeName: string;
  verticalDescription: string | null;
  categories: TenantCategory[];
}

/** Everything a prompt needs about a tenant, in two reads. */
export async function getVerticalContext(
  tenantId: number,
  storeName?: string | null,
): Promise<VerticalContext> {
  const [settings, categories] = await Promise.all([
    getTenantSettings(tenantId),
    getTenantCategories(tenantId),
  ]);
  const vertical =
    settings?.vertical && isVertical(settings.vertical)
      ? settings.vertical
      : "jewellery";
  return {
    vertical,
    preset: VERTICAL_PRESETS[vertical],
    storeName: storeName ?? "the store",
    verticalDescription: settings?.verticalDescription?.trim() || null,
    categories,
  };
}

/**
 * The tenant's category keys, in display order. `excludeFolded` drops keys
 * that only exist as a fold into other categories (e.g. jewellery "Sets"
 * surface under Necklaces/Earrings) — extractors describing a single
 * photographed item should not offer those as choices.
 */
export function categoryKeys(
  vc: VerticalContext,
  opts?: { excludeFolded?: boolean },
): string[] {
  let keys = vc.categories.map((c) => c.key);
  if (opts?.excludeFolded) {
    const folded = new Set(vc.categories.flatMap((c) => c.extraIncludes ?? []));
    keys = keys.filter((k) => !folded.has(k));
  }
  return keys;
}

/**
 * `"${storeName}", a jewellery boutique.` — plus the merchant's own range
 * description when they wrote one.
 */
export function storeIdentityLine(vc: VerticalContext): string {
  const base = `"${vc.storeName}", ${vc.preset.storeNoun}`;
  return vc.verticalDescription
    ? `${base}. The merchant describes their range as: "${vc.verticalDescription}"`
    : base;
}

/**
 * One `* Key → hints` line per category for classification prompts. Preset
 * categories carry their curated EN/DE synonym hints; merchant-added ones
 * fall back to their labels. Always ends with the fallback category.
 */
export function categoryTaxonomyLines(vc: VerticalContext): string {
  const presetByKey = new Map(vc.preset.categories.map((c) => [c.key, c]));
  const lines = vc.categories
    .filter((c) => c.key !== FALLBACK_CATEGORY_KEY)
    .map((c) => {
      const synonyms = presetByKey.get(c.key)?.synonyms;
      const hints = synonyms?.length
        ? synonyms.join(", ")
        : [c.labelEn, c.labelDe].filter(Boolean).join(", ");
      return `  * ${c.key} → ${hints}`;
    });
  lines.push(
    `  * ${FALLBACK_CATEGORY_KEY} → anything that does not fit the above`,
  );
  return lines.join("\n");
}

/** Listing values for the AI-extraction failure path (never guesses a price). */
export function fallbackProduct(vc: VerticalContext): {
  name: string;
  nameEn: string;
  nameFr: string;
  nameIt: string;
  description: string;
  descriptionEn: string;
  descriptionFr: string;
  descriptionIt: string;
  category: string;
} {
  return { ...vc.preset.fallback, category: FALLBACK_CATEGORY_KEY };
}

/**
 * The single message→product extraction prompt shared by the Discord, Slack
 * and WhatsApp intake bots (previously three near-identical copies).
 */
export function buildIntakeExtractionPrompt(
  vc: VerticalContext,
  opts?: { germanOutput?: boolean },
): {
  system: string;
  jsonSchema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
} {
  const keys = categoryKeys(vc, { excludeFolded: true });
  const system = `You are a product data extractor for ${storeIdentityLine(vc)}.
Extract product information from the owner's message and return a JSON object.${
    opts?.germanOutput
      ? "\nWrite the product name and description in German (Swiss German spelling: use ss instead of ß)."
      : ""
  }

Available categories: ${keys.map((k) => `"${k}"`).join(", ")}

Rules:
- name: short elegant product name (2–6 words)
- description: full product description as provided, cleaned up for display
- price: numeric value only (no currency symbols; assume CHF if unspecified)
- category: must be exactly one of the categories above; infer from context if not explicit
${categoryTaxonomyLines(vc)}

Return ONLY valid JSON, no markdown, no explanation.`;

  const jsonSchema = {
    name: "product_info",
    strict: true,
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Short elegant product name",
        },
        description: {
          type: "string",
          description: "Full product description",
        },
        price: {
          type: "number",
          description: "Numeric price value in CHF",
        },
        category: {
          type: "string",
          enum: keys,
          description: "Product category",
        },
      },
      required: ["name", "description", "price", "category"],
      additionalProperties: false,
    },
  };

  return { system, jsonSchema };
}

/** Throws BAD_REQUEST unless `category` is one of the tenant's category keys. */
export async function assertTenantCategory(
  tenantId: number,
  category: string,
): Promise<void> {
  await assertTenantCategories(tenantId, [category]);
}

/** Same as assertTenantCategory for a batch, with a single categories fetch. */
export async function assertTenantCategories(
  tenantId: number,
  categories: string[],
): Promise<void> {
  const valid = new Set(
    (await getTenantCategories(tenantId)).map((c) => c.key),
  );
  const unknown = Array.from(new Set(categories.filter((c) => !valid.has(c))));
  if (unknown.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown categor${unknown.length === 1 ? "y" : "ies"} ${unknown
        .map((c) => `"${c}"`)
        .join(", ")}. Valid categories: ${Array.from(valid)
        .map((c) => `"${c}"`)
        .join(", ")}`,
    });
  }
}
