import { test, expect, type Page } from "@playwright/test";
import { BRAND } from "../shared/brand";

/**
 * Storefront purchase journey (data-driven e2e).
 *
 * Unlike smoke.spec.ts (which asserts the DB-free shell), these drive a real
 * shopping flow — shop list → product → add to bag → checkout — so they need a
 * running database seeded with a tenant that has at least one visible,
 * in-stock, photographed product.
 *
 * They are therefore OPT-IN and skipped by default:
 *   E2E_STOREFRONT=1                 enable this suite
 *   E2E_TENANT_SLUG=<slug>           the seeded tenant's slug (default "demo")
 *
 * On localhost the client resolves the storefront surface + tenant from the
 * query string (?surface=storefront&tenant=<slug>) and forwards it to the API
 * as the x-tenant-slug header — see client/src/lib/surface.ts + main.tsx — so no
 * subdomain or hosts-file setup is needed. Run against a seeded DB with:
 *   E2E_STOREFRONT=1 E2E_TENANT_SLUG=kalakosh npm run test:e2e
 */

const RUN = process.env.E2E_STOREFRONT === "1";
const TENANT = process.env.E2E_TENANT_SLUG ?? "demo";
const describeStorefront = RUN ? test.describe : test.describe.skip;

const storeUrl = (path: string) => {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}surface=storefront&tenant=${encodeURIComponent(TENANT)}`;
};

// Render the UI in English deterministically, regardless of the saved default.
async function openInEnglish(page: Page, path: string) {
  // Serialised into the page, so the key is passed rather than closed over.
  await page.addInitScript((key: string) => {
    try {
      localStorage.setItem(key, "en");
    } catch {
      /* storage unavailable — fall back to the default language */
    }
  }, BRAND.langKey);
  await page.goto(storeUrl(path), { waitUntil: "networkidle" });
}

const productCards = (page: Page) =>
  page.getByRole("article", { name: /^View / });

describeStorefront("storefront purchase journey", () => {
  test("the shop lists the seeded tenant's products", async ({ page }) => {
    await openInEnglish(page, "/shop");
    await expect(productCards(page).first()).toBeVisible();
    expect(await productCards(page).count()).toBeGreaterThan(0);
  });

  test("a shopper can add a product to the bag from the product modal", async ({
    page,
  }) => {
    await openInEnglish(page, "/shop");
    await productCards(page).first().click();

    const addToBag = page.getByRole("button", { name: /add to bag/i });
    await expect(addToBag).toBeVisible();
    await addToBag.click();

    // The cart drawer opens and reflects the added item.
    await expect(page.getByText(/your bag/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /proceed to checkout/i }),
    ).toBeVisible();
  });

  test("proceeding to checkout shows the bag and the payment panel", async ({
    page,
  }) => {
    await openInEnglish(page, "/shop");
    await productCards(page).first().click();
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.getByRole("button", { name: /proceed to checkout/i }).click();

    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByText(/^checkout$/i).first()).toBeVisible();
    await expect(page.getByText(/subtotal/i).first()).toBeVisible();

    // The pay button only renders when the tenant has online payments enabled.
    // Accept the policy and confirm the CTA becomes actionable; tolerate a
    // tenant without Stripe configured (the panel shows an "unavailable" notice).
    const payButton = page.getByRole("button", { name: /pay securely/i });
    if (await payButton.count()) {
      await page.getByRole("checkbox").first().check();
      await expect(payButton).toBeEnabled();
    } else {
      await expect(page.getByText(/unavailable/i).first()).toBeVisible();
    }
  });
});

/**
 * Optional: actually initiate the Stripe redirect. Requires the seeded tenant to
 * have a working Stripe (Connect) configuration in test mode. Guarded separately
 * so the journey above can run against a tenant without payments configured.
 *   E2E_STOREFRONT=1 E2E_STRIPE=1 E2E_TENANT_SLUG=<slug> npm run test:e2e
 */
const describeStripe =
  RUN && process.env.E2E_STRIPE === "1" ? test.describe : test.describe.skip;

describeStripe("storefront checkout initiates Stripe", () => {
  test("clicking Pay redirects to Stripe Checkout", async ({ page }) => {
    await openInEnglish(page, "/shop");
    await productCards(page).first().click();
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.getByRole("button", { name: /proceed to checkout/i }).click();

    await page.getByRole("checkbox").first().check();
    await Promise.all([
      page.waitForURL(/checkout\.stripe\.com|\/checkout\/(success|cancel)/, {
        timeout: 20_000,
      }),
      page.getByRole("button", { name: /pay securely/i }).click(),
    ]);
  });
});
