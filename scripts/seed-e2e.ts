/**
 * Seed the minimum data the storefront e2e journey needs (e2e/storefront.spec.ts):
 * one tenant plus one visible, in-stock, photographed product, so
 * `products.list` returns something for that tenant.
 *
 * Idempotent: safe to run repeatedly (e.g. on every CI run). Configure with:
 *   DATABASE_URL      (required) MySQL connection string
 *   E2E_TENANT_SLUG   tenant slug to seed (default "demo")
 *
 * Usage:  DATABASE_URL=mysql://… E2E_TENANT_SLUG=demo npx tsx scripts/seed-e2e.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { tenants, products } from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[seed-e2e] DATABASE_URL is required");
  process.exit(1);
}

const SLUG = process.env.E2E_TENANT_SLUG ?? "demo";

async function main() {
  const db = drizzle(DATABASE_URL as string, { mode: "default" });

  // ── Tenant ────────────────────────────────────────────────────────────────
  const existing = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, SLUG))
    .limit(1);

  let tenantId: number;
  if (existing.length > 0) {
    tenantId = existing[0].id;
    console.log(`[seed-e2e] tenant "${SLUG}" already exists (id=${tenantId})`);
  } else {
    await db.insert(tenants).values({
      slug: SLUG,
      name: `${SLUG} storefront (e2e)`,
      plan: "growth",
      posApiKey: `pos_${nanoid(24)}`,
      referralCode: nanoid(10),
    });
    const [row] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, SLUG))
      .limit(1);
    tenantId = row.id;
    console.log(`[seed-e2e] created tenant "${SLUG}" (id=${tenantId})`);
  }

  // ── Product ───────────────────────────────────────────────────────────────
  // The storefront read requires visible=true and a non-null imageUrl.
  const visible = await db
    .select()
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .limit(1);

  if (visible.length > 0) {
    console.log("[seed-e2e] tenant already has products — nothing to add");
  } else {
    await db.insert(products).values({
      tenantId,
      name: "E2E Moonstone Ring",
      description: "A seeded product for the storefront e2e journey.",
      nameEn: "E2E Moonstone Ring",
      descriptionEn: "A seeded product for the storefront e2e journey.",
      price: "185.00",
      category: "Rings",
      // Inline 1×1 PNG so the storefront needs no external network in CI
      // (keeps Playwright's networkidle fast and dependency-free).
      imageUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      imageKey: "e2e/moonstone-ring.png",
      visible: true,
      sold: false,
      quantity: 5,
      source: "manual",
    });
    console.log("[seed-e2e] created a visible product for the tenant");
  }

  console.log("[seed-e2e] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-e2e] failed:", err);
  process.exit(1);
});
