/**
 * One-time backfill: generate nameEn + descriptionEn for all products that
 * currently have those columns NULL.
 *
 * Usage:
 *   DATABASE_URL="mysql://..." LLM_API_KEY="sk-..." pnpm tsx scripts/backfill-translations.ts
 *
 * Safe to re-run — products that already have nameEn are skipped.
 * Processes 5 products in parallel, 1 s pause between batches.
 */

import "dotenv/config";
import { eq, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { products } from "../drizzle/schema";
import { invokeLLM } from "../server/_core/llm";

// ─── DB ───────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function translateProduct(
  id: number,
  nameDe: string,
  descriptionDe: string,
): Promise<{ nameEn: string; descriptionEn: string }> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a luxury jewellery copywriter for Kalakosh Jewellery – Zürich.
You will receive a German product name and description for a handcrafted jewellery piece.
Your job is to produce elegant English equivalents.

Rules:
- name_en: short elegant English product name (2–5 words). Start with the specific stone or pearl type, e.g. "Moonstone Drop Earrings", "Labradorite Wrap Bracelet", "Baroque Pearl Necklace".
- description_en: EXACTLY ONE lyrical English sentence. Name the specific stone/pearl variety and material. Be sensory and poetic — evoke colour, lustre, texture, and feeling. Example: "Deep-violet amethyst cabochons shimmer in a hand-wrought sterling-silver setting — elegance that draws every eye."

Return ONLY valid JSON, no markdown.`,
      },
      {
        role: "user",
        content: `German name: "${nameDe}"\nGerman description: "${descriptionDe}"`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "translation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            name_en: {
              type: "string",
              description: "English product name (2-5 words)",
            },
            description_en: {
              type: "string",
              description: "One lyrical English sentence",
            },
          },
          required: ["name_en", "description_en"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No content from LLM");
  const parsed = JSON.parse(
    typeof raw === "string" ? raw : JSON.stringify(raw),
  );
  return {
    nameEn: parsed.name_en as string,
    descriptionEn: parsed.description_en as string,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Find all products missing English content
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
    })
    .from(products)
    .where(or(isNull(products.nameEn), isNull(products.descriptionEn)));

  if (rows.length === 0) {
    console.log(
      "All products already have English translations. Nothing to do.",
    );
    return;
  }

  console.log(`Found ${rows.length} product(s) to backfill.\n`);

  const BATCH_SIZE = 5;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    console.log(
      `Batch ${batchNum}/${totalBatches} — translating ${batch.length} product(s)…`,
    );

    await Promise.all(
      batch.map(async (row) => {
        try {
          const { nameEn, descriptionEn } = await translateProduct(
            row.id,
            row.name,
            row.description,
          );
          await db
            .update(products)
            .set({ nameEn, descriptionEn })
            .where(eq(products.id, row.id));
          console.log(`  ✓ [${row.id}] "${row.name}" → "${nameEn}"`);
          console.log(`       EN: ${descriptionEn}`);
          succeeded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ [${row.id}] "${row.name}" failed: ${msg}`);
          failed++;
        }
      }),
    );

    // Pause between batches to stay within rate limits
    if (i + BATCH_SIZE < rows.length) {
      await sleep(1000);
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  if (failed > 0) {
    console.log(
      "Re-run the script to retry failed products — it skips already-translated ones.",
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
