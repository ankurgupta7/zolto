/**
 * Screenshot real marketing components for visual review.
 *
 *   ./tools/screenshot/fetch-fonts.sh          # once per clone
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   node tools/screenshot/shoot.mjs out/ "A whole shop in your pocket"
 *
 * Renders the actual Landing page against the actual index.css — no mocked
 * components — then scrolls the page so every IntersectionObserver reveal
 * fires before capturing. Pass section text to capture one band; omit it for
 * a full-page shot.
 *
 * Why bother when there are unit tests: tests assert the DOM, not the render.
 * Every visual bug found so far here was invisible to them — Tailwind emitting
 * no utilities, a sketch underline trailing past a wrapped heading, and a
 * price reading "CHF o" because Cormorant defaults to oldstyle figures.
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "/"));
// The repo depends on @playwright/test, not the bare `playwright` package —
// both re-export the same chromium driver, so accept whichever is installed
// rather than failing with a misleading "module not found".
const { chromium } = (() => {
  for (const pkg of ["playwright", "@playwright/test"]) {
    try {
      return require(pkg);
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    "Neither 'playwright' nor '@playwright/test' is installed — run `pnpm install` first.",
  );
})();

const [outDir = "screenshots", ...sections] = process.argv.slice(2);
const URL = process.env.SHOT_URL ?? "http://localhost:5199/";

// Playwright's bundled Chromium build often mismatches the sandbox's
// pre-installed one; point at the pinned binary when it exists.
const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

// Scroll the whole page so scroll-triggered reveals have fired by capture time,
// then return to the top and let transitions settle.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1500);

const loaded = await page.evaluate(() => [
  ...new Set(
    [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
  ),
]);
// An empty list means the shot is showing fallback faces and cannot be trusted
// for anything typographic — run fetch-fonts.sh.
console.log("fonts loaded:", loaded.length ? loaded.join(", ") : "NONE ⚠");

if (sections.length === 0) {
  await page.screenshot({ path: `${outDir}/page.png`, fullPage: true });
  console.log(`wrote ${outDir}/page.png`);
} else {
  for (const [i, text] of sections.entries()) {
    const el = page.locator("section").filter({ hasText: text }).first();
    const file = `${outDir}/section-${i + 1}.png`;
    await el.screenshot({ path: file });
    console.log(`wrote ${file} — "${text}"`);
  }
}

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
