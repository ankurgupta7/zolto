/**
 * Screenshot real marketing components for visual review.
 *
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

// The storefront, marketing site and admin console all render in de/en/fr/it,
// so a shot is only evidence for the language it was taken in. SHOT_LANG picks
// one; it seeds the same localStorage key the app persists (client/src/lib/
// i18n.ts) and the browser locale behind it, so date and number formatting is
// checked too. Unset → whatever the app's own default resolves to.
const shotLang = process.env.SHOT_LANG;
const HTML_LANG = { de: "de-CH", en: "en", fr: "fr-CH", it: "it-CH" };
if (shotLang && !HTML_LANG[shotLang]) {
  throw new Error(
    `SHOT_LANG must be one of ${Object.keys(HTML_LANG).join(", ")} — got "${shotLang}"`,
  );
}

// Desktop by default. SHOT_VIEWPORT=390x844 takes the shot at phone width,
// which is the only way to see layout that only breaks once the header stops
// fitting on one line.
const viewport = (() => {
  const raw = process.env.SHOT_VIEWPORT;
  if (!raw) return { width: 1280, height: 900 };
  const m = /^(\d+)x(\d+)$/.exec(raw.trim());
  if (!m)
    throw new Error(`SHOT_VIEWPORT must look like 390x844 — got "${raw}"`);
  return { width: Number(m[1]), height: Number(m[2]) };
})();

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport,
  deviceScaleFactor: 2,
  isMobile: viewport.width < 768,
  hasTouch: viewport.width < 768,
  ...(shotLang ? { locale: HTML_LANG[shotLang] } : {}),
});

if (shotLang) {
  // Runs before any page script, so i18n reads it during module init rather
  // than booting English and re-rendering after the shot is already taken.
  await page.addInitScript((lang) => {
    localStorage.setItem("kalakosh_lang", lang);
  }, shotLang);
}

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

// SHOT_FILL="Your current shop address=https://bergblume.ch" types into a
// field before anything is clicked. Without it, any state that lives behind a
// form is unreachable: the submit button is disabled on an empty input, so
// SHOT_CLICK alone silently captures the at-rest page and proves nothing.
// Comma-separate to fill several; the value may contain "=", the label may not.
if (process.env.SHOT_FILL) {
  for (const pair of process.env.SHOT_FILL.split(",")) {
    const [label, ...rest] = pair.split("=");
    await page.getByLabel(label.trim()).first().fill(rest.join("=").trim());
  }
  await page.waitForTimeout(300);
}

// SHOT_CLICK="Add Product" clicks a control first, so a shot can capture what
// a page looks like *after* an interaction rather than only at rest. Comma-
// separate to click a sequence — SHOT_CLICK="Next,Next" walks a tour along.
//
// Use "||" as the separator instead when a label contains a comma of its own —
// German and French CTAs routinely do ("Zeig mir, was übernommen werden kann"),
// and splitting those on the comma looks for two buttons that don't exist and
// times out. Copy should never be bent around the screenshot tool.
if (process.env.SHOT_CLICK) {
  const raw = process.env.SHOT_CLICK;
  const names = (raw.includes("||") ? raw.split("||") : raw.split(","))
    .map((n) => n.trim())
    .filter(Boolean);
  for (const name of names) {
    await page
      .getByRole("button", { name: name.trim(), exact: true })
      .first()
      .click();
    await page.waitForTimeout(1200);
  }
}

const loaded = await page.evaluate(() => [
  ...new Set(
    [...document.fonts]
      .filter((f) => f.status === "loaded")
      .map((f) => f.family),
  ),
]);
// An empty list means the shot is showing fallback faces and cannot be trusted
// for anything typographic — check that client/public/fonts is intact.
console.log("fonts loaded:", loaded.length ? loaded.join(", ") : "NONE ⚠");

if (sections.length === 0) {
  // SHOT_FULLPAGE=0 captures only what is actually on screen — the way to
  // check whether an interaction left the thing it opened within view.
  const fullPage = process.env.SHOT_FULLPAGE !== "0";
  await page.screenshot({ path: `${outDir}/page.png`, fullPage });
  console.log(`wrote ${outDir}/page.png${fullPage ? "" : " (viewport only)"}`);
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
