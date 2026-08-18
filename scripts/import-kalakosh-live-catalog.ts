/**
 * One-time (re-runnable) migration: pulls the Kalakosh catalogue into this
 * deployment's Kalakosh tenant.
 *
 * Usage:
 *   pnpm tsx scripts/import-kalakosh-live-catalog.ts path/to/.env
 *   pnpm tsx scripts/import-kalakosh-live-catalog.ts --env-file=path/to/.env --dry-run
 *
 * The env file must set DATABASE_URL (the destination) and the S3_* storage
 * vars — the same ones this app already uses, see .env.example. If no path is
 * given, ./.env is loaded from the current directory.
 *
 * Set KALAKOSH_DATABASE_URL (or pass --source-db=…) to a read-only connection
 * to the old kalakosh.ch database — or to a throwaway MySQL holding a restored
 * `deploy/backup.sh` dump, which is safer and lets you dry-run repeatedly.
 * That is the only source that carries the whole inventory: hidden pieces,
 * sold-out pieces, pieces that were never photographed, and every product's
 * gallery images. Without it the script falls back to kalakosh.ch's public
 * products.list endpoint, which is the storefront view and shows only visible,
 * photographed products.
 *
 * A dump carries image URLs and keys, not the image bytes. Set the
 * KALAKOSH_S3_* vars (see .env.example) so photos are read straight from the
 * old bucket by key; otherwise they are fetched over HTTP from --asset-base,
 * which needs kalakosh.ch to still be serving them.
 *
 * Flags:
 *   --dry-run            report what would be imported, write nothing
 *   --source-db=<url>    source MySQL URL (else KALAKOSH_DATABASE_URL)
 *   --source-url=<url>   public products.list endpoint for the fallback path
 *   --asset-base=<url>   host that relative /uploads/... image URLs resolve against
 *   --tenant=<slug>      destination tenant slug (default "kalakosh")
 *
 * Safe to re-run — products already present are skipped, matched by name.
 * Images are downloaded and re-hosted in this deployment's own storage rather
 * than linked back to the old site.
 *
 * Any products missing English name/description afterward can be backfilled
 * with scripts/backfill-translations.ts.
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { config as loadEnvFile } from "dotenv";
import { getDb } from "../server/db";
import { importKalakoshCatalog } from "../server/importKalakosh";

export interface ParsedArgs {
  envFilePath?: string;
  dryRun: boolean;
  sourceDatabaseUrl?: string;
  sourceUrl?: string;
  assetBaseUrl?: string;
  tenantSlug?: string;
}

/**
 * Splits argv into the env-file path and the option flags. The env file is the
 * first bare argument, accepted either positionally or as `--env-file=path`,
 * so the original single-argument invocation keeps working unchanged.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { dryRun: false };

  for (const arg of argv) {
    const flag = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!flag) {
      parsed.envFilePath ??= arg;
      continue;
    }
    const [, name, value] = flag;
    switch (name) {
      case "env-file":
        parsed.envFilePath = value;
        break;
      case "dry-run":
        parsed.dryRun = true;
        break;
      case "source-db":
        parsed.sourceDatabaseUrl = value;
        break;
      case "source-url":
        parsed.sourceUrl = value;
        break;
      case "asset-base":
        parsed.assetBaseUrl = value;
        break;
      case "tenant":
        parsed.tenantSlug = value;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

/** First CLI arg, accepting either a bare path or --env-file=path. */
export function resolveEnvFilePath(argv: string[]): string | undefined {
  return parseArgs(argv).envFilePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.envFilePath) {
    if (!existsSync(args.envFilePath)) {
      console.error(`Env file not found: ${args.envFilePath}`);
      process.exit(1);
    }
    loadEnvFile({ path: args.envFilePath });
  } else {
    loadEnvFile();
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      `DATABASE_URL is not set${args.envFilePath ? ` in ${args.envFilePath}` : ""}.`,
    );
    process.exit(1);
  }
  await getDb();

  const summary = await importKalakoshCatalog({
    log: console.log,
    dryRun: args.dryRun,
    sourceDatabaseUrl: args.sourceDatabaseUrl,
    sourceUrl: args.sourceUrl,
    assetBaseUrl: args.assetBaseUrl,
    tenantSlug: args.tenantSlug,
  });

  if (args.dryRun) {
    console.log(`\nDry run complete — ${summary.imported} would be imported.`);
    return;
  }

  console.log(
    `\nDone. Imported ${summary.imported} (${summary.withoutImage} without a photo, ` +
      `${summary.galleryImages} gallery image(s)), skipped ${summary.skipped} ` +
      `(already present), ${summary.failed} failed, ${summary.imagesFailed} image(s) ` +
      "could not be re-hosted.",
  );
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
