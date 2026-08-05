import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Resolve a Chromium binary to drive.
 *
 * - In a standard CI, `npx playwright install chromium` provides the build that
 *   matches this @playwright/test version — return undefined and let Playwright
 *   resolve it itself.
 * - In this managed environment Chromium is pre-installed under
 *   PLAYWRIGHT_BROWSERS_PATH at a revision that may not match, so point straight
 *   at the on-disk binary (env override wins).
 */
function resolveChromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsersRoot && fs.existsSync(browsersRoot)) {
    const match = fs
      .readdirSync(browsersRoot)
      .filter((d) => d.startsWith("chromium-"))
      .map((d) => path.join(browsersRoot, d, "chrome-linux", "chrome"))
      .find((p) => fs.existsSync(p));
    if (match) return match;
  }
  return undefined;
}

const executablePath = resolveChromiumPath();

export default defineConfig({
  testDir: dirname,
  testMatch: "**/*.spec.ts",
  // The e2e run is opt-in (npm run test:e2e); keep it out of the unit suite.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "line",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Pin the browser language. The app picks its UI language from
    // navigator.language when nothing is saved (client/src/lib/i18n.ts), so an
    // unpinned locale makes every text assertion depend on whatever the runner's
    // Chromium happens to report — which is exactly how the storefront smoke
    // test broke on main: it asserted German nav labels while CI's Chromium
    // reported en-US, so the app rendered English and "Kontakt" was never found.
    // English is pinned because the storefront journey asserts English copy
    // throughout; the German path is covered explicitly in smoke.spec.ts.
    locale: "en-US",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Boot the real app (dev mode → Vite middleware serves the SPA). Works without
  // a database: DB reads degrade to fallbacks and the marketing shell still
  // renders. When DATABASE_URL is provided the storefront paths light up too.
  webServer: {
    command: `NODE_ENV=development PORT=${PORT} npx tsx server/_core/index.ts`,
    cwd: repoRoot,
    url: BASE_URL,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
