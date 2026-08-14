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

// SHOT_THEME=light shoots the marketing surface in light mode, and
// SHOT_LIGHT=porcelain picks which light palette (see the html[data-theme]
// blocks in client/src/index.css). A theme is exactly the kind of change unit
// tests are blind to — they assert class names, and every class name here is
// identical in both themes — so a light-mode change that has not been shot has
// not been looked at.
//
// Seeded into the same storage the app reads rather than stamping the attribute
// on <html> directly: that way the shot exercises the real preference path, and
// a page mounted without MarketingShell (the harness default) still themes,
// because the entry applies it too.
const shotTheme = process.env.SHOT_THEME;
if (shotTheme && !["light", "dark"].includes(shotTheme)) {
  throw new Error(`SHOT_THEME must be light or dark — got "${shotTheme}"`);
}
if (shotTheme || process.env.SHOT_LIGHT) {
  await page.addInitScript(
    ({ theme, palette }) => {
      if (theme) localStorage.setItem("zolto_theme", theme);
      if (palette) localStorage.setItem("zolto_light_palette", palette);
    },
    { theme: shotTheme, palette: process.env.SHOT_LIGHT },
  );
}

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

// The homepage reel snaps the *document* scroller and its chapters are made of
// viewport-sized panels, so this page renders without MarketingShell's sticky
// nav — which would make every panel 64px taller than production and flatter
// every fit. Stand one in, and let the stage re-measure against it.
await page.evaluate(() => {
  if (!document.querySelector("[data-testid='reel-stage']")) return;
  if (document.querySelector("header")) return;
  const header = document.createElement("header");
  header.style.cssText =
    "position:sticky;top:0;height:var(--nav-height);z-index:50;background:var(--brand-ground);border-bottom:1px solid var(--brand-border)";
  document.body.prepend(header);
  window.dispatchEvent(new Event("resize"));
});

// Scroll the page so scroll-triggered reveals have fired by capture time, then
// return to the top and let transitions settle.
await page.evaluate(async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1500);

// SHOT_CHAPTER=3 / SHOT_PANEL=7 move the reel to a chapter or to one panel
// before capturing — the only way to shoot anything but the first screen, since
// each is a screen of its own. Pair either with SHOT_FULLPAGE=0: a full-page
// shot of a 21-panel reel is a 12,000px image nobody can read.
//
// The reel has two axes below its layout breakpoint, so SHOT_PANEL takes both:
// it scrolls the page down to the panel's chapter *and* its chapter's track
// sideways to the panel. Scrolling only down lands on the first slide of the
// post and quietly shoots the wrong panel.
const reelTarget = process.env.SHOT_PANEL
  ? { kind: "panel", nth: Number(process.env.SHOT_PANEL) }
  : process.env.SHOT_CHAPTER
    ? { kind: "chapter", nth: Number(process.env.SHOT_CHAPTER) }
    : null;
if (reelTarget) {
  if (!Number.isInteger(reelTarget.nth) || reelTarget.nth < 1) {
    throw new Error(
      `SHOT_${reelTarget.kind.toUpperCase()} must be a 1-based index — got "${reelTarget.nth}"`,
    );
  }
  const label = await page.evaluate(({ kind, nth }) => {
    const attr = kind === "panel" ? "data-reel-panel" : "data-reel-chapter";
    const target = document.querySelectorAll(`[${attr}]`)[nth - 1];
    if (!target) return null;
    const nav =
      document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const post = target.closest("[data-reel-chapter]") ?? target;
    window.scrollTo({
      top: post.getBoundingClientRect().top + window.scrollY - nav,
      behavior: "instant",
    });
    let sideways = "";
    const track = target.closest("[data-testid='reel-track']");
    if (kind === "panel" && track) {
      const slides = Array.from(track.querySelectorAll("[data-reel-panel]"));
      const index = slides.indexOf(target);
      track.scrollLeft =
        target.getBoundingClientRect().left -
        track.getBoundingClientRect().left +
        track.scrollLeft;
      sideways = `, slide ${index + 1}/${slides.length}`;
    }
    return `${target.getAttribute(attr)}${sideways} (${target.offsetHeight}px)`;
  }, reelTarget);
  if (!label) throw new Error(`no reel ${reelTarget.kind} ${reelTarget.nth}`);
  console.log(`scrolled to ${reelTarget.kind} ${reelTarget.nth} — ${label}`);
  await page.waitForTimeout(800);
}

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
    // Not every control is a <button> by role: a single-select toggle group
    // (the catalogue's grid/list switch) is a radiogroup, a tab is a tab. Fall
    // back to the accessible label so a shot of "what this control does" does
    // not require reshaping the control to suit the tool.
    const asButton = page.getByRole("button", { name, exact: true }).first();
    const target = (await asButton.count())
      ? asButton
      : page.getByLabel(name, { exact: true }).first();
    await target.click();
    await page.waitForTimeout(1200);
  }
}

// SHOT_SCROLL=600 leaves the page scrolled down that many pixels before the
// shot. Paired with SHOT_FULLPAGE=0 it is the only way to see whether chrome
// that is supposed to stay put — a sticky sidebar, a sticky header — actually
// did, since a full-page capture always renders the page as it looks at rest.
if (process.env.SHOT_SCROLL) {
  const y = Number(process.env.SHOT_SCROLL);
  if (!Number.isFinite(y)) {
    throw new Error(
      `SHOT_SCROLL must be a number of pixels — got "${process.env.SHOT_SCROLL}"`,
    );
  }
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await page.waitForTimeout(400);
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

// Reported from the DOM rather than echoed back from SHOT_THEME: the point is
// to prove the page actually took the theme, not that the tool was asked for it.
const painted = await page.evaluate(() => {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  return {
    theme: root.dataset.theme ?? "dark",
    palette: root.dataset.light ?? "—",
    band: styles.getPropertyValue("--brand-band").trim(),
  };
});
console.log(
  `theme: ${painted.theme} (palette ${painted.palette}, band ${painted.band})`,
);

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
