/**
 * Fix language errors: detects products where name/description were accidentally
 * uploaded in English (when German was intended) and corrects them.
 *
 * - English products → translates name + description to German; sets nameEn + descriptionEn
 * - German products  → leaves name + description alone; fills nameEn + descriptionEn if missing
 *
 * Usage:
 *   DATABASE_URL="mysql://..." LLM_API_KEY="sk-..." pnpm tsx scripts/fix-language-errors.ts
 *   DATABASE_URL="mysql://..." LLM_API_KEY="sk-..." pnpm tsx scripts/fix-language-errors.ts --dry-run
 *
 * --dry-run prints what would change without writing anything to the database.
 *
 * Safe to re-run — German products that already have nameEn set are skipped.
 * Processes 5 products in parallel, 1 s pause between batches.
 */

import "dotenv/config";
import { eq, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { products } from "../drizzle/schema";
import { invokeLLM } from "../server/_core/llm";

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 1000;

// ─── DB ───────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ─── Types ────────────────────────────────────────────────────────────────────

interface LLMResult {
  sourceLang: "de" | "en" | "other";
  nameDe: string;
  nameEn: string;
  descriptionDe: string;
  descriptionEn: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function analyseProduct(
  currentName: string,
  currentDescription: string
): Promise<LLMResult> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a bilingual luxury jewellery copywriter for Kalakosh Jewellery – Zürich.
You will receive the current name and description of a handcrafted jewellery piece.
The content may be in German (correct) or accidentally in English (needs fixing).

Your tasks:
1. Detect the language of the provided content ("de", "en", or "other").
2. Produce a correct German name and a correct English name.
3. Produce a correct German description (EXACTLY ONE sentence) and a correct English description (EXACTLY ONE sentence).

Rules for names:
- name_de: short elegant Swiss German name (2–5 words). Swiss German spelling: "ss" not "ß".
  Name the specific stone or pearl type first, e.g. "Mondstein-Ohrhänger", "Labradorit-Armband", "Barockperlen-Kollier".
- name_en: short elegant English name (2–5 words), e.g. "Moonstone Drop Earrings", "Labradorite Cuff Bracelet".

Rules for descriptions (EXACTLY ONE sentence each):
- description_de: One lyrical Swiss German sentence. Name the specific stone/pearl variety.
  Be sensory and poetic — evoke colour, lustre, texture, and feeling. Use "ss" not "ß".
  Example: "Tief-violette Amethyst-Cabochons schimmern in einem handgefertigten Sterlingsilber-Rahmen – Eleganz, die den Blick anzieht."
- description_en: One lyrical English sentence with the same jewel specificity and poetic tone.
  Example: "Deep-violet amethyst cabochons shimmer in a hand-wrought sterling-silver setting — elegance that draws every eye."

Return ONLY valid JSON, no markdown.`,
      },
      {
        role: "user",
        content: `Current name: "${currentName}"\nCurrent description: "${currentDescription}"`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "language_fix",
        strict: true,
        schema: {
          type: "object",
          properties: {
            source_lang: {
              type: "string",
              enum: ["de", "en", "other"],
              description: "Detected language of the provided content",
            },
            name_de: { type: "string", description: "Correct Swiss German product name (2-5 words)" },
            name_en: { type: "string", description: "Correct English product name (2-5 words)" },
            description_de: { type: "string", description: "One lyrical Swiss German sentence" },
            description_en: { type: "string", description: "One lyrical English sentence" },
          },
          required: ["source_lang", "name_de", "name_en", "description_de", "description_en"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No content from LLM");
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));

  return {
    sourceLang: parsed.source_lang as "de" | "en" | "other",
    nameDe: parsed.name_de as string,
    nameEn: parsed.name_en as string,
    descriptionDe: parsed.description_de as string,
    descriptionEn: parsed.description_en as string,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) {
    console.log("DRY RUN — no changes will be written to the database.\n");
  }

  // Fetch all products where either the German fields may be wrong OR EN fields are missing.
  // We process everything so we can detect language errors even in "complete" rows.
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      nameEn: products.nameEn,
      descriptionEn: products.descriptionEn,
    })
    .from(products);

  if (rows.length === 0) {
    console.log("No products found.");
    return;
  }

  console.log(`Scanning ${rows.length} product(s) for language errors…\n`);

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
  let fixed = 0;       // EN content written to DE fields
  let enriched = 0;    // only EN fields filled/updated
  let skipped = 0;     // already correct + complete, nothing to do
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`Batch ${batchNum}/${totalBatches}…`);

    await Promise.all(
      batch.map(async (row) => {
        try {
          const result = await analyseProduct(row.name, row.description);
          const isEnglish = result.sourceLang === "en";
          const needsEnFill = !row.nameEn || !row.descriptionEn;

          // Nothing to do: correct language and EN already filled
          if (!isEnglish && !needsEnFill) {
            console.log(`  — [${row.id}] "${row.name}"  (DE ✓, EN ✓ — no change)`);
            skipped++;
            return;
          }

          if (isEnglish) {
            // Source was English: correct the German fields AND set EN fields
            console.log(`  🔧 [${row.id}] ENGLISH DETECTED — fixing`);
            console.log(`       was  : "${row.name}"`);
            console.log(`       DE   : "${result.nameDe}"`);
            console.log(`       EN   : "${result.nameEn}"`);
            console.log(`       DE desc: ${result.descriptionDe}`);
            console.log(`       EN desc: ${result.descriptionEn}`);

            if (!DRY_RUN) {
              await db.update(products)
                .set({
                  name: result.nameDe,
                  description: result.descriptionDe,
                  nameEn: result.nameEn,
                  descriptionEn: result.descriptionEn,
                })
                .where(eq(products.id, row.id));
            }
            fixed++;
          } else {
            // German content is fine, just fill missing EN fields
            console.log(`  ✓ [${row.id}] "${row.name}"  (DE ✓ — filling EN)`);
            console.log(`       EN name: "${result.nameEn}"`);
            console.log(`       EN desc: ${result.descriptionEn}`);

            if (!DRY_RUN) {
              await db.update(products)
                .set({
                  nameEn: result.nameEn,
                  descriptionEn: result.descriptionEn,
                })
                .where(eq(products.id, row.id));
            }
            enriched++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ [${row.id}] "${row.name}" failed: ${msg}`);
          failed++;
        }
      })
    );

    if (i + BATCH_SIZE < rows.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  console.log("\n─────────────────────────────────────────────");
  if (DRY_RUN) console.log("DRY RUN complete — nothing was written.\n");

  const changed = fixed + enriched;
  console.log(`Fixed (EN→DE)  : ${fixed}`);
  console.log(`Enriched (DE+EN): ${enriched}`);
  console.log(`Already correct : ${skipped}`);
  if (failed > 0) {
    console.log(`Failed          : ${failed}  ← re-run to retry`);
  }
  if (changed > 0 && DRY_RUN) {
    console.log(`\nRe-run without --dry-run to apply these ${changed} change(s).`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
