/**
 * One-time (re-runnable) import: pulls the live kalakosh.ch product catalog
 * into this deployment's Kalakosh tenant.
 *
 * Usage:
 *   DATABASE_URL="mysql://..." \
 *   S3_BUCKET=... S3_REGION=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
 *   pnpm tsx scripts/import-kalakosh-live-catalog.ts
 *
 * Safe to re-run — products already present (matched by name) are skipped.
 * Product images are downloaded from kalakosh.ch and re-hosted in this
 * deployment's own storage rather than linked back to the old site.
 *
 * Any products missing English name/description afterward can be backfilled
 * with scripts/backfill-translations.ts.
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { importKalakoshCatalog } from "../server/importKalakosh";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  await getDb();

  const summary = await importKalakoshCatalog({ log: console.log });

  console.log(
    `\nDone. Imported ${summary.imported}, skipped ${summary.skipped} (already present), ${summary.failed} failed.`,
  );
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
