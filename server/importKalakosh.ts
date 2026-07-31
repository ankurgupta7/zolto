/**
 * Import the live kalakosh.ch catalog into this deployment's Kalakosh tenant.
 *
 * kalakosh.ch runs this same app (single-tenant), so its public
 * `products.list` tRPC endpoint already returns exactly the shape this
 * deployment's `products` table expects. This migrates that catalog onto the
 * Zolto multi-tenant platform (Kalakosh = tenant "kalakosh", tenant #1 — see
 * docs/planning/zolto-business-plan.md) instead of re-keying it by hand.
 *
 * Idempotent: re-running only imports products whose name isn't already
 * present for the tenant, so a second run (e.g. after kalakosh.ch adds new
 * pieces) only pulls in what's new.
 *
 * Images are re-hosted into this deployment's own storage rather than kept
 * as links back to the old site, so the new store doesn't depend on
 * kalakosh.ch staying up.
 */
import { PRODUCT_CATEGORIES, type ProductCategory } from "@shared/const";
import type { InsertProduct } from "../drizzle/schema";
import type { WithOptionalTenant } from "./_core/tenant";
import { createProduct, getAllProducts, getTenantBySlug } from "./db";
import { assertPublicHostname } from "./ssrf";
import { storagePut } from "./storage";

export const DEFAULT_SOURCE_URL = "https://kalakosh.ch/api/trpc/products.list";
const KALAKOSH_TENANT_SLUG = "kalakosh";

/** Shape returned by a deployment's public `products.list` tRPC procedure. */
export interface RemoteProduct {
  id: number;
  name: string;
  description: string;
  nameEn?: string | null;
  descriptionEn?: string | null;
  price: string | number;
  category: string;
  imageUrl?: string | null;
  quantity?: number;
  sold?: boolean;
  visible?: boolean;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  failed: number;
}

/** Case/whitespace-insensitive key used to detect a product already imported. */
export function dedupeKey(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeCategory(raw: string): ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as ProductCategory)
    : "Other";
}

/**
 * Maps one remote catalog row onto this deployment's insert shape. Returns
 * `null` for rows missing the fields we can't sensibly default (name, price).
 */
export function mapRemoteProduct(
  remote: RemoteProduct,
): WithOptionalTenant<InsertProduct> | null {
  const name = remote.name?.trim();
  const description = remote.description?.trim();
  const price = String(remote.price ?? "").trim();
  if (!name || !description || !price) return null;

  return {
    name,
    description,
    nameEn: remote.nameEn ?? null,
    descriptionEn: remote.descriptionEn ?? null,
    price,
    category: normalizeCategory(remote.category),
    quantity: remote.quantity ?? 1,
    sold: remote.sold ?? false,
    visible: remote.visible ?? true,
    source: "manual",
  };
}

function extensionFor(url: string, contentType: string | null): string {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1].toLowerCase() : "jpg";
}

/** Downloads a product image and re-hosts it in this deployment's own storage. */
async function rehostImage(
  imageUrl: string,
  fetchImpl: typeof fetch,
  tenantId?: number,
): Promise<{ imageKey: string; imageUrl: string } | null> {
  try {
    const hostname = new URL(imageUrl).hostname;
    await assertPublicHostname(hostname);

    const response = await fetchImpl(imageUrl);
    if (!response.ok) {
      throw new Error(`Image fetch failed with status ${response.status}`);
    }
    const contentType = response.headers.get("content-type");
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `import/kalakosh/${Date.now()}.${extensionFor(imageUrl, contentType)}`;
    const { key: storedKey, url } = await storagePut(
      key,
      buffer,
      contentType ?? "image/jpeg",
      tenantId,
    );
    return { imageKey: storedKey, imageUrl: url };
  } catch (err) {
    console.warn(`[importKalakosh] Could not re-host image ${imageUrl}:`, err);
    return null;
  }
}

interface RemoteResponse {
  result?: { data?: { json?: RemoteProduct[] } };
}

export interface ImportOptions {
  sourceUrl?: string;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

/** Fetches the live catalog and creates any products not yet imported for the Kalakosh tenant. */
export async function importKalakoshCatalog(
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const sourceUrl = options.sourceUrl ?? DEFAULT_SOURCE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});

  const tenant = await getTenantBySlug(KALAKOSH_TENANT_SLUG);
  if (!tenant) {
    throw new Error(
      `No tenant with slug "${KALAKOSH_TENANT_SLUG}" found — run tenant seeding first.`,
    );
  }

  await assertPublicHostname(new URL(sourceUrl).hostname);
  const response = await fetchImpl(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceUrl}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as RemoteResponse;
  const remoteProducts = body.result?.data?.json ?? [];

  const existing = await getAllProducts(tenant.id);
  const existingKeys = new Set(existing.map((p) => dedupeKey(p.name)));

  const summary: ImportSummary = { imported: 0, skipped: 0, failed: 0 };

  for (const remote of remoteProducts) {
    if (existingKeys.has(dedupeKey(remote.name ?? ""))) {
      log(`Skipping "${remote.name}" — already imported.`);
      summary.skipped++;
      continue;
    }

    const mapped = mapRemoteProduct(remote);
    if (!mapped) {
      log(`Skipping remote product id ${remote.id} — missing required fields.`);
      summary.failed++;
      continue;
    }

    try {
      const image = remote.imageUrl
        ? await rehostImage(remote.imageUrl, fetchImpl, tenant.id)
        : null;

      await createProduct({
        ...mapped,
        tenantId: tenant.id,
        imageKey: image?.imageKey ?? null,
        imageUrl: image?.imageUrl ?? null,
      });
      log(`Imported "${mapped.name}".`);
      summary.imported++;
      existingKeys.add(dedupeKey(mapped.name));
    } catch (err) {
      log(`Failed to import "${remote.name}": ${err}`);
      summary.failed++;
    }
  }

  return summary;
}
