/**
 * Render the POS mockup screens to PNG at phone size.
 *
 *   node docs/planning/phase1/marketing/pos-mockup/shoot.mjs
 *
 * These are MOCKUPS, not the product — see README.md. The real till is the
 * Android app under `android/`, which cannot be screenshotted without a device,
 * which is the entire reason this file exists.
 *
 * Serves `docs/planning/phase1` as the web root so the pages can reference the
 * real product photography in `assets/` rather than carrying duplicate copies.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
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
  throw new Error("Install @playwright/test first.");
})();

const ROOT = path.resolve("docs/planning/phase1");
const OUT = path.resolve("docs/planning/phase1/marketing/pos-mockup");
const PORT = Number(process.env.MOCK_PORT ?? 5310);

const TYPES = {
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  // Resolve inside ROOT only — a mockup harness still shouldn't serve the repo.
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
// deviceScaleFactor 3 → 1170×2532, so the shot can be cut into a 1080×1920
// vertical timeline without upscaling.
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
});

for (const [src, out] of [
  ["grid", "pos-grid"],
  ["pay", "pos-payment"],
]) {
  await page.goto(`http://localhost:${PORT}/marketing/pos-mockup/${src}.html`, {
    waitUntil: "networkidle",
  });
  const broken = await page.evaluate(
    () => [...document.images].filter((i) => !i.complete || !i.naturalWidth).length,
  );
  if (broken) throw new Error(`${src}.html: ${broken} image(s) failed to load`);
  await page.screenshot({ path: path.join(OUT, `${out}.png`) });
  console.log(`wrote ${out}.png`);
}

await browser.close();
server.close();
