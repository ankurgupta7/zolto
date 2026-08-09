/**
 * Migrate the Kalakosh catalogue onto this deployment's Zolto tenant.
 *
 * kalakosh.ch runs the single-tenant ancestor of this app. Zolto's schema has
 * since moved on — every row carries a `tenant_id`, `products.category` points
 * at the tenant's own `tenant_categories` list instead of a global enum, there
 * are per-locale name/description columns, uploads are metered against the
 * tenant's storage quota, and the plan caps catalogue size. This module maps
 * the old catalogue onto that shape.
 *
 * ## Where the catalogue is read from
 *
 * Preferred: a direct read-only connection to the Kalakosh MySQL database
 * (`KALAKOSH_DATABASE_URL`). This is the only source that carries the *whole*
 * inventory — hidden pieces, sold-out pieces, pieces that were never
 * photographed, and each product's extra gallery images.
 *
 * Fallback: the public `products.list` tRPC endpoint. Convenient when there is
 * no database access, but it is deliberately a storefront view —
 * `getVisibleProducts()` filters to `visible = true AND imageUrl IS NOT NULL`,
 * so an unphotographed or hidden piece is invisible to it and gallery images
 * are not exposed at all. The importer warns loudly when it falls back to it.
 *
 * ## Idempotency
 *
 * Re-running only imports what isn't there yet. Products are matched by
 * normalized name, but *by count* rather than by presence: if the source has
 * three rows called "Pearl Drops" and the destination has one, two more are
 * imported. Kalakosh's catalogue genuinely contains same-name rows (see the
 * duplicate-cleanup tool in `server/routers/products.ts`), and a
 * presence-based check would silently drop them — the opposite of migrating
 * the whole inventory.
 *
 * ## Where the photos come from
 *
 * A database dump carries `imageUrl`/`imageKey` strings, never image bytes, so
 * the photos have to be pulled from wherever they actually live and re-hosted
 * into this deployment's own storage. Set `KALAKOSH_S3_*` to read them
 * straight out of the old bucket — the only route that survives kalakosh.ch
 * going dark, and the one that matters when the old deployment left
 * `S3_PUBLIC_URL` blank and its `imageUrl`s are relative `/uploads/<key>`
 * paths only its own web app can serve. Failing that, they are fetched over
 * HTTP from `assetBaseUrl`.
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PLANS } from "@shared/platform";
import { FALLBACK_CATEGORY_KEY } from "@shared/verticals";
import type { InsertProduct } from "../drizzle/schema";
import type { WithOptionalTenant } from "./_core/tenant";
import {
  addProductImage,
  createProduct,
  getAllProducts,
  getTenantBySlug,
  getTenantCategories,
} from "./db";
import { assertPublicHostname } from "./ssrf";
import { StorageQuotaError, storagePut } from "./storage";

export const DEFAULT_SOURCE_URL = "https://kalakosh.ch/api/trpc/products.list";
/**
 * Base for image URLs stored relative. The old deployment writes
 * `/uploads/<key>` into `imageUrl` whenever `S3_PUBLIC_URL` is unset (see its
 * `storage.ts buildPublicUrl`), and those only resolve against its own host.
 */
export const DEFAULT_ASSET_BASE_URL = "https://kalakosh.ch";
export const DEFAULT_TENANT_SLUG = "kalakosh";

/** One product as it exists on the source deployment. */
export interface SourceProduct {
  id: number;
  name: string;
  description?: string | null;
  nameEn?: string | null;
  descriptionEn?: string | null;
  price: string | number | null;
  category?: string | null;
  imageUrl?: string | null;
  /** S3 object key in the SOURCE bucket — the fallback when the URL can't be fetched. */
  imageKey?: string | null;
  quantity?: number | null;
  /** MySQL hands booleans back as 0/1, the tRPC endpoint as true/false. */
  sold?: boolean | number | null;
  visible?: boolean | number | null;
  source?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  /** Extra gallery images (the primary one lives in `imageUrl`). */
  images?: SourceImage[];
}

export interface SourceImage {
  imageUrl: string;
  imageKey?: string | null;
  sortOrder?: number | null;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  failed: number;
  /** Products imported with no photo — real stock, invisible on the storefront. */
  withoutImage: number;
  /** Extra gallery rows created alongside the imported products. */
  galleryImages: number;
  /** Images that could not be re-hosted; their product still imported. */
  imagesFailed: number;
}

/** Case/whitespace-insensitive key used to match a product already imported. */
export function dedupeKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Resolves a source category onto one of the destination tenant's own category
 * keys. Categories are per-tenant now (`tenant_categories`), so the valid list
 * comes from the tenant being written to — not from a hard-coded preset.
 * Matching is case-insensitive; anything unrecognised lands in the fallback
 * category, which every preset guarantees.
 */
export function resolveCategory(
  raw: string | null | undefined,
  tenantCategoryKeys: readonly string[],
): string {
  const wanted = (raw ?? "").trim().toLowerCase();
  const match = tenantCategoryKeys.find((key) => key.toLowerCase() === wanted);
  return match ?? FALLBACK_CATEGORY_KEY;
}

/** `decimal(10,2)`-safe price string, or null when the source value is unusable. */
export function normalizePrice(value: string | number | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed.toFixed(2);
}

function toBool(value: boolean | number | null | undefined, fallback: boolean) {
  if (value === null || value === undefined) return fallback;
  return typeof value === "number" ? value !== 0 : value;
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Maps one source row onto this deployment's insert shape. Returns `null` only
 * for rows we cannot sensibly default — a nameless or unpriced product.
 *
 * A missing description is *not* a reason to drop stock: the column is NOT
 * NULL but an empty string is legal, and a merchant's un-described piece is
 * still a piece they own. The locale columns (nameDe/Fr/It) stay null — the
 * storefront falls back to the primary text (client/src/lib/localize.ts), and
 * scripts/backfill-translations.ts fills them in afterwards.
 */
export function mapSourceProduct(
  row: SourceProduct,
  tenantCategoryKeys: readonly string[],
): WithOptionalTenant<InsertProduct> | null {
  const name = row.name?.trim();
  const price = normalizePrice(row.price);
  if (!name || !price) return null;

  const createdAt = toDate(row.createdAt);
  const updatedAt = toDate(row.updatedAt);

  return {
    name,
    description: row.description?.trim() || row.descriptionEn?.trim() || "",
    nameEn: row.nameEn?.trim() || null,
    descriptionEn: row.descriptionEn?.trim() || null,
    price,
    category: resolveCategory(row.category, tenantCategoryKeys),
    quantity: row.quantity ?? 1,
    sold: toBool(row.sold, false),
    visible: toBool(row.visible, true),
    source: row.source === "whatsapp" ? "whatsapp" : "manual",
    // `createdAt` drives catalogue ordering on both the storefront and admin,
    // so carrying it over keeps the merchant's catalogue in the order they
    // built it instead of re-dating everything to the migration run.
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    // discordMessageId is deliberately dropped: it is a globally UNIQUE intake
    // token belonging to the old deployment's Discord bot, and a collision
    // would fail the insert and lose a product.
  };
}

/** Resolves a possibly-relative source image URL against the old site's host. */
export function resolveAssetUrl(
  url: string,
  assetBaseUrl: string,
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, `${assetBaseUrl.replace(/\/+$/, "")}/`).toString();
  } catch {
    return null;
  }
}

const KNOWN_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
]);

export function extensionFor(url: string, contentType: string | null): string {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("avif")) return "avif";
  const match = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
  const ext = match?.[1].toLowerCase();
  if (!ext || !KNOWN_IMAGE_EXTENSIONS.has(ext)) return "jpg";
  return ext === "jpeg" ? "jpg" : ext;
}

/**
 * The OLD deployment's S3 bucket, read directly by object key.
 *
 * Distinct from this deployment's own `S3_*` vars: the two stores keep
 * separate buckets and credentials on purpose (.env.example's golden rule).
 * Fetching by key is what makes a migration from a database backup possible
 * at all — the dump carries `imageKey`/`imageUrl` strings, never the bytes,
 * and when the old deployment left `S3_PUBLIC_URL` blank its `imageUrl` is a
 * relative `/uploads/<key>` that only its own web app can serve. Without this
 * the photos die with kalakosh.ch.
 */
export interface SourceS3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Reads `KALAKOSH_S3_*`. Returns null when the bucket isn't configured. */
export function sourceS3ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SourceS3Config | null {
  const bucket = env.KALAKOSH_S3_BUCKET;
  const accessKeyId = env.KALAKOSH_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.KALAKOSH_S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region: env.KALAKOSH_S3_REGION ?? "us-east-1",
    endpoint: env.KALAKOSH_S3_ENDPOINT,
    accessKeyId,
    secretAccessKey,
  };
}

/** Loaded image bytes plus the name its file extension is inferred from. */
interface LoadedImage {
  buffer: Buffer;
  contentType: string | null;
  origin: string;
}

export type SourceObjectReader = (key: string) => Promise<LoadedImage>;

/** Binds a `GetObject` reader to the source bucket. */
export function createSourceObjectReader(
  config: SourceS3Config,
): SourceObjectReader {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint
      ? { endpoint: config.endpoint, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return async (key: string) => {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty body for source object ${key}`);
    return {
      buffer: Buffer.from(bytes),
      contentType: response.ContentType ?? null,
      origin: key,
    };
  };
}

interface ImageContext {
  assetBaseUrl: string;
  fetchImpl: typeof fetch;
  readSourceObject: SourceObjectReader | null;
}

/**
 * Gets one image's bytes, preferring the source bucket over the source site.
 *
 * The bucket is authoritative and needs neither the old web app to be running
 * nor its images to be publicly readable, so it goes first whenever an object
 * key and credentials are both available. HTTP remains the fallback — and the
 * only path when `KALAKOSH_S3_*` is unset, which is exactly the behaviour
 * this had before.
 */
async function loadImage(
  image: { imageKey?: string | null; imageUrl?: string | null },
  ctx: ImageContext,
): Promise<LoadedImage | null> {
  const key = image.imageKey?.trim();
  if (key && ctx.readSourceObject) {
    try {
      return await ctx.readSourceObject(key);
    } catch (err) {
      console.warn(
        `[importKalakosh] Source bucket has no readable object "${key}", falling back to its URL:`,
        err,
      );
    }
  }

  const resolved = image.imageUrl
    ? resolveAssetUrl(image.imageUrl, ctx.assetBaseUrl)
    : null;
  if (!resolved) return null;

  await assertPublicHostname(new URL(resolved).hostname);
  const response = await ctx.fetchImpl(resolved);
  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
    origin: resolved,
  };
}

/**
 * Loads one source image and re-hosts it in this deployment's storage.
 *
 * A `StorageQuotaError` is rethrown rather than swallowed: once the tenant is
 * over their plan's allowance every later upload fails too, so the run should
 * stop and say so instead of quietly importing a photoless catalogue.
 */
async function rehostImage(
  tenantId: number,
  image: { imageKey?: string | null; imageUrl?: string | null },
  relKey: string,
  ctx: ImageContext,
): Promise<{ imageKey: string; imageUrl: string } | null> {
  try {
    const loaded = await loadImage(image, ctx);
    if (!loaded) return null;

    const { key, url } = await storagePut(
      tenantId,
      `${relKey}.${extensionFor(loaded.origin, loaded.contentType)}`,
      loaded.buffer,
      loaded.contentType ?? "image/jpeg",
    );
    return { imageKey: key, imageUrl: url };
  } catch (err) {
    if (err instanceof StorageQuotaError) throw err;
    console.warn(
      `[importKalakosh] Could not re-host image ${image.imageKey ?? image.imageUrl}:`,
      err,
    );
    return null;
  }
}

// ─── Sources ─────────────────────────────────────────────────────────────────

interface SourceProductRow {
  id: number;
  name: string;
  description: string | null;
  nameEn: string | null;
  descriptionEn: string | null;
  price: string | number | null;
  category: string | null;
  imageUrl: string | null;
  imageKey: string | null;
  quantity: number | null;
  sold: number | boolean | null;
  visible: number | boolean | null;
  source: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

interface SourceImageRow {
  productId: number;
  imageUrl: string;
  imageKey: string | null;
  sortOrder: number | null;
}

/** Joins the two source tables into one product-with-gallery list. */
export function shapeSourceRows(
  productRows: SourceProductRow[],
  imageRows: SourceImageRow[],
): SourceProduct[] {
  const galleries = new Map<number, SourceImage[]>();
  for (const row of imageRows) {
    if (!row.imageUrl && !row.imageKey) continue;
    const list = galleries.get(row.productId) ?? [];
    list.push({
      imageUrl: row.imageUrl,
      imageKey: row.imageKey ?? null,
      sortOrder: row.sortOrder ?? 0,
    });
    galleries.set(row.productId, list);
  }
  galleries.forEach((list) => {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  });
  return productRows.map((row) => ({
    ...row,
    images: galleries.get(row.id) ?? [],
  }));
}

/**
 * Reads the complete catalogue straight out of the source database — every
 * product regardless of visibility, stock or whether it was ever photographed,
 * plus each product's gallery images.
 */
export async function readSourceCatalogFromDatabase(
  databaseUrl: string,
): Promise<SourceProduct[]> {
  const { createConnection } = await import("mysql2/promise");
  const connection = await createConnection(databaseUrl);
  try {
    const [productRows] = await connection.query(
      `SELECT id, name, description, nameEn, descriptionEn, price, category,
              imageUrl, imageKey, quantity, sold, visible, source,
              createdAt, updatedAt
         FROM products
        ORDER BY createdAt ASC, id ASC`,
    );
    const [imageRows] = await connection.query(
      `SELECT productId, imageUrl, imageKey, sortOrder
         FROM product_images
        ORDER BY productId ASC, sortOrder ASC, id ASC`,
    );
    return shapeSourceRows(
      productRows as SourceProductRow[],
      imageRows as SourceImageRow[],
    );
  } finally {
    await connection.end();
  }
}

interface RemoteResponse {
  result?: { data?: { json?: SourceProduct[] } };
}

/** Reads the storefront-visible slice of the catalogue over the public API. */
export async function readSourceCatalogOverHttp(
  sourceUrl: string,
  fetchImpl: typeof fetch,
): Promise<SourceProduct[]> {
  await assertPublicHostname(new URL(sourceUrl).hostname);
  const response = await fetchImpl(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceUrl}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as RemoteResponse;
  return body.result?.data?.json ?? [];
}

export interface ImportOptions {
  /** Read-only connection to the source database. Defaults to `KALAKOSH_DATABASE_URL`. */
  sourceDatabaseUrl?: string;
  /** Public `products.list` endpoint, used only when no source database is given. */
  sourceUrl?: string;
  /** Host that relative `/uploads/...` image URLs resolve against. */
  assetBaseUrl?: string;
  /** Destination tenant. Defaults to "kalakosh". */
  tenantSlug?: string;
  /** Report what would be imported without writing anything. */
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
  /** Test seam — bypasses source selection entirely. */
  readSource?: () => Promise<SourceProduct[]>;
  /** Test seam — bypasses the `KALAKOSH_S3_*` bucket reader. */
  readSourceObject?: SourceObjectReader;
}

async function loadSourceCatalog(
  options: ImportOptions,
  log: (message: string) => void,
): Promise<SourceProduct[]> {
  if (options.readSource) return options.readSource();

  const databaseUrl =
    options.sourceDatabaseUrl ?? process.env.KALAKOSH_DATABASE_URL;
  if (databaseUrl) {
    log("Reading the full catalogue from the source database.");
    return readSourceCatalogFromDatabase(databaseUrl);
  }

  const sourceUrl = options.sourceUrl ?? DEFAULT_SOURCE_URL;
  log(
    `⚠ No source database configured (KALAKOSH_DATABASE_URL) — falling back to ${sourceUrl}.\n` +
      "  That endpoint is the storefront view: hidden pieces, sold-out pieces,\n" +
      "  pieces without a photo and every gallery image are NOT in it. Set\n" +
      "  KALAKOSH_DATABASE_URL to migrate the whole inventory.",
  );
  return readSourceCatalogOverHttp(sourceUrl, options.fetchImpl ?? fetch);
}

/**
 * Fetches the source catalogue and creates whatever isn't in the destination
 * tenant yet, re-hosting every image it carries.
 */
export async function importKalakoshCatalog(
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const tenantSlug = options.tenantSlug ?? DEFAULT_TENANT_SLUG;
  const assetBaseUrl = options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL;

  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) {
    throw new Error(
      `No tenant with slug "${tenantSlug}" found — run tenant seeding first.`,
    );
  }

  const sourceS3 = sourceS3ConfigFromEnv();
  const imageContext: ImageContext = {
    assetBaseUrl,
    fetchImpl,
    readSourceObject:
      options.readSourceObject ??
      (sourceS3 ? createSourceObjectReader(sourceS3) : null),
  };
  log(
    imageContext.readSourceObject
      ? "Photos will be pulled straight from the source bucket, falling back to their URLs."
      : `⚠ No source bucket configured (KALAKOSH_S3_*) — photos will be fetched over HTTP from ${assetBaseUrl}.\n` +
          "  If the old deployment left S3_PUBLIC_URL blank its imageUrls are relative and only\n" +
          "  it can serve them, so migrating from a backup after it goes dark needs the bucket.",
  );

  const sourceProducts = await loadSourceCatalog(options, log);
  log(`Source catalogue: ${sourceProducts.length} product(s).`);

  const categoryKeys = (await getTenantCategories(tenant.id)).map((c) => c.key);
  const existing = await getAllProducts(tenant.id);

  // Counting matches rather than testing for presence keeps genuine same-name
  // duplicates in the source from collapsing into a single imported row.
  const remainingExisting = new Map<string, number>();
  for (const product of existing) {
    const key = dedupeKey(product.name);
    remainingExisting.set(key, (remainingExisting.get(key) ?? 0) + 1);
  }

  const summary: ImportSummary = {
    imported: 0,
    skipped: 0,
    failed: 0,
    withoutImage: 0,
    galleryImages: 0,
    imagesFailed: 0,
  };

  // Decide the whole work list before writing anything, so the plan-cap check
  // below can refuse up front instead of stopping halfway through a migration.
  const queue: Array<{
    row: SourceProduct;
    mapped: WithOptionalTenant<InsertProduct>;
  }> = [];
  for (const row of sourceProducts) {
    const key = dedupeKey(row.name ?? "");
    const already = remainingExisting.get(key) ?? 0;
    if (key && already > 0) {
      remainingExisting.set(key, already - 1);
      log(`Skipping "${row.name}" — already imported.`);
      summary.skipped++;
      continue;
    }

    const mapped = mapSourceProduct(row, categoryKeys);
    if (!mapped) {
      log(
        `Skipping source product id ${row.id} — no usable name or price (name: ${JSON.stringify(row.name)}, price: ${JSON.stringify(row.price)}).`,
      );
      summary.failed++;
      continue;
    }
    queue.push({ row, mapped });
  }

  const cap = PLANS.find((p) => p.id === tenant.plan)?.maxProducts;
  if (cap !== undefined && existing.length + queue.length > cap) {
    throw new Error(
      `Importing ${queue.length} product(s) on top of ${existing.length} existing would exceed the ` +
        `${cap}-product limit of the ${tenant.plan} plan. Upgrade the tenant before migrating — ` +
        "stopping now so the catalogue isn't left half-migrated.",
    );
  }

  if (options.dryRun) {
    const withoutImage = queue.filter(
      ({ row }) => !row.imageUrl && !row.imageKey,
    ).length;
    log(
      `\nDry run — nothing written. Would import ${queue.length} product(s), ` +
        `${withoutImage} of them without a photo.`,
    );
    return { ...summary, imported: queue.length, withoutImage };
  }

  for (const { row, mapped } of queue) {
    try {
      const hasPrimary = Boolean(row.imageUrl || row.imageKey);
      const primary = hasPrimary
        ? await rehostImage(
            tenant.id,
            row,
            `import/kalakosh/${row.id}/primary`,
            imageContext,
          )
        : null;
      if (hasPrimary && !primary) summary.imagesFailed++;

      const result = await createProduct({
        ...mapped,
        tenantId: tenant.id,
        imageKey: primary?.imageKey ?? null,
        imageUrl: primary?.imageUrl ?? null,
      });
      summary.imported++;
      if (!primary) {
        summary.withoutImage++;
        log(`Imported "${mapped.name}" (no photo).`);
      } else {
        log(`Imported "${mapped.name}".`);
      }

      const productId = (result as { insertId?: number }).insertId;
      if (!productId) {
        // The product is saved; only its gallery is unreachable without an id.
        log(`  ⚠ No insertId for "${mapped.name}" — skipping its gallery.`);
        continue;
      }

      // Gallery images are non-fatal: the product row is already committed, so
      // a failed extra photo must not undo an imported piece of stock.
      // Identity is the object key where there is one — two rows can carry the
      // same photo under different URLs (relative vs public) but never under
      // different keys.
      const identity = (image: SourceImage | SourceProduct) =>
        image.imageKey?.trim() || image.imageUrl?.trim() || "";
      const seen = new Set([identity(row)].filter(Boolean));
      let sortOrder = 1;
      for (const image of row.images ?? []) {
        const id = identity(image);
        if (id && seen.has(id)) continue;
        seen.add(id);
        const rehosted = await rehostImage(
          tenant.id,
          image,
          `import/kalakosh/${row.id}/${sortOrder}`,
          imageContext,
        );
        if (!rehosted) {
          summary.imagesFailed++;
          continue;
        }
        await addProductImage({
          tenantId: tenant.id,
          productId,
          imageKey: rehosted.imageKey,
          imageUrl: rehosted.imageUrl,
          sortOrder: sortOrder++,
        });
        summary.galleryImages++;
      }
    } catch (err) {
      if (err instanceof StorageQuotaError) {
        log(`\n✖ ${err.message}`);
        throw err;
      }
      log(`Failed to import "${row.name}": ${err}`);
      summary.failed++;
    }
  }

  if (summary.withoutImage > 0) {
    log(
      `\nNote: ${summary.withoutImage} imported product(s) have no photo. They are in ` +
        "the admin catalogue and POS, but the storefront only lists products with an image.",
    );
  }

  return summary;
}
