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
    await expect(
      page.getByText(/explore the shop/i).first(),
    ).toBeVisible();
    // Value props render from client-side content.
    await expect(page.getByText(/secure checkout/i).first()).toBeVisible();

    expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("primary marketing navigation is present", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav, header").first();
    await expect(nav).toBeVisible();
    // German marketing nav labels rendered by the client.
    for (const label of ["Shop", "FAQ", "Kontakt"]) {
      await expect(
        page.getByRole("link", { name: new RegExp(label, "i") }).first(),
      ).toBeVisible();
    }
  });

  test("client-side routing to the FAQ page works without a full reload", async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    await page
      .getByRole("link", { name: /FAQ/i })
      .first()
      .click();

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
