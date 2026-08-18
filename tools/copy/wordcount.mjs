/**
 * Count the words on a rendered marketing page, per reel chapter.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   node tools/copy/wordcount.mjs            # chapter totals
 *   node tools/copy/wordcount.mjs --prose    # also list the prose blocks
 *
 * A word budget only holds if something checks it. The homepage was measured
 * at 1,380 words in August 2026 — 879 of them in 29 blocks of continuous
 * prose — which is what docs/landing-copy-audit.html argues about. Re-run this
 * after a copy change rather than guessing whether the page got lighter.
 *
 * Counts come from the rendered DOM, not the source: `innerText` per
 * `section[id]`, so chapter labels, badges and figure text count too. That is
 * deliberate — a reader does not skip a word because it lives in a <span>.
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "/"));
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

const URL = process.env.SHOT_URL ?? "http://localhost:5199/";
const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const showProse = process.argv.includes("--prose");

// 1440x900 is the width the reel was tuned at, so it is the number to compare
// against previous runs. Narrower viewports drop nothing but wrap differently.
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
// Let the IntersectionObserver reveals fire; a hidden ScrollReveal still has
// its text in the DOM, but waiting keeps the run consistent with the shots.
await page.waitForTimeout(1500);

const { chapters, prose } = await page.evaluate(() => {
  const words = (s) => (s || "").trim().split(/\s+/).filter(Boolean).length;
  const chapters = [];
  const prose = [];
  for (const section of document.querySelectorAll("section[id]")) {
    chapters.push({ id: section.id, total: words(section.innerText) });
    for (const block of section.querySelectorAll("p, li, dd")) {
      if (block.querySelector("p, li")) continue; // leaf blocks only
      const n = words(block.innerText);
      // 12+ words is the threshold for "a reader has to read this", as
      // opposed to a label, a badge or a price.
      if (n >= 12)
        prose.push({
          id: section.id,
          n,
          text: block.innerText.replace(/\s+/g, " "),
        });
    }
  }
  return { chapters, prose };
});

const pad = (n, w) => String(n).padStart(w);
let total = 0;
console.log("Chapter                     words");
console.log("─".repeat(34));
for (const c of chapters) {
  total += c.total;
  console.log(c.id.padEnd(26) + pad(c.total, 6));
}
console.log("─".repeat(34));
console.log("TOTAL".padEnd(26) + pad(total, 6));

const proseTotal = prose.reduce((sum, p) => sum + p.n, 0);
console.log(
  `\n${proseTotal} words in ${prose.length} prose blocks of 12+ words ` +
    `(${Math.round((proseTotal / total) * 100)}% of the page)`,
);
console.log(`~${Math.round((total / 250) * 60)}s of reading at 250 wpm`);

if (showProse) {
  console.log("\nProse blocks, longest first:");
  for (const p of [...prose].sort((a, b) => b.n - a.n))
    console.log(`${pad(p.n, 4)}  [${p.id}]  ${p.text}`);
}

await browser.close();
