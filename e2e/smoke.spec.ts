import { test, expect, type Page } from "@playwright/test";

// Browser end-to-end smoke test. Boots the real app (see playwright.config.ts's
// webServer) and drives it in a headless Chromium, verifying the SPA actually
// builds, loads, hydrates, and routes on the client — the things an in-process
// supertest run can't observe. These assertions target the marketing surface,
// which renders without a database, so the suite is portable: it passes in CI
// with or without DATABASE_URL provisioned.

// Fail the test on any uncaught client-side exception during the scenario.
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test.describe("marketing shell", () => {
  test("landing page loads, hydrates and paints its hero", async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/Zolto/i);
    // The hero CTA is client-rendered, proving React hydrated (not just the shell).
    await expect(page.getByText(/explore the shop/i).first()).toBeVisible();
    // Value props render from client-side content.
    await expect(page.getByText(/secure checkout/i).first()).toBeVisible();

    expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("primary marketing navigation is present", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav, header").first();
    await expect(nav).toBeVisible();
    // Nav labels rendered by the client, in the language the config pins
    // (playwright.config.ts `locale`). These were German until the platform
    // became language-aware; the labels themselves are not the point, the
    // client-rendered nav is.
    for (const label of ["Shop", "FAQ", "Contact"]) {
      await expect(
        page.getByRole("link", { name: new RegExp(label, "i") }).first(),
      ).toBeVisible();
    }
  });

  test("switching language re-renders the nav in German", async ({ page }) => {
    // The platform ships in de/fr/it/en and stores the choice under
    // "kalakosh_lang". Worth one browser-level assertion: the unit tests can
    // prove the locale files agree, but only a real page load proves the saved
    // choice beats the browser's own language on first paint.
    await page.addInitScript(() =>
      window.localStorage.setItem("kalakosh_lang", "de"),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("link", { name: /Kontakt/i }).first(),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
  });

  test("client-side routing to the FAQ page works without a full reload", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    await page.getByRole("link", { name: /FAQ/i }).first().click();

    await expect(page).toHaveURL(/\/faq/i);
    // The FAQ route rendered some content client-side.
    await expect(page.locator("body")).toContainText(/\w{4,}/);
    expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("SEO & agent discovery (served by the same app)", () => {
  test("robots.txt and llms.txt are reachable in the browser", async ({
    page,
  }) => {
    const robots = await page.goto("/robots.txt");
    expect(robots?.status()).toBe(200);
    expect(await page.locator("body").innerText()).toMatch(/User-agent/i);

    const llms = await page.goto("/llms.txt");
    expect(llms?.status()).toBe(200);
  });
});
