/**
 * One-time (re-runnable) import: pulls the live kalakosh.ch product catalog
 * into this deployment's Kalakosh tenant.
 *
 * Usage:
 *   pnpm tsx scripts/import-kalakosh-live-catalog.ts path/to/.env
 *   pnpm tsx scripts/import-kalakosh-live-catalog.ts --env-file=path/to/.env
 *
 * The env file must set DATABASE_URL and the S3_* storage vars (same ones
 * this app already uses — see .env.example). If no path is given, falls
 * back to loading ./.env from the current directory.
 *
 * Safe to re-run — products already present (matched by name) are skipped.
 * Product images are downloaded from kalakosh.ch and re-hosted in this
 * deployment's own storage rather than linked back to the old site.
 *
 * Any products missing English name/description afterward can be backfilled
 * with scripts/backfill-translations.ts.
 */
import { existsSync } from "node:fs";
import { config as loadEnvFile } from "dotenv";
import { getDb } from "../server/db";
import { importKalakoshCatalog } from "../server/importKalakosh";

/** First CLI arg, accepting either a bare path or --env-file=path. */
export function resolveEnvFilePath(argv: string[]): string | undefined {
  const arg = argv[0];
  if (!arg) return undefined;
  const flagMatch = arg.match(/^--env-file=(.+)$/);
  return flagMatch ? flagMatch[1] : arg;
}

async function main() {
  const envFilePath = resolveEnvFilePath(process.argv.slice(2));

  if (envFilePath) {
    if (!existsSync(envFilePath)) {
      console.error(`Env file not found: ${envFilePath}`);
      process.exit(1);
    }
    loadEnvFile({ path: envFilePath });
  } else {
    loadEnvFile();
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      `DATABASE_URL is not set${envFilePath ? ` in ${envFilePath}` : ""}.`,
    );
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
