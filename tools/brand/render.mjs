/**
 * Renders the brand marks into every raster asset that ships.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   node tools/brand/render.mjs
 *
 * A script rather than a one-off, because the bitmaps have drifted from the
 * vector before: the previous rebrand renamed the Android drawable to match the
 * new name and left the *old* brand's wordmark inside the file, which then
 * shipped on the register's main screen. Anything derived from the mark is
 * regenerated here, from tools/screenshot/marks.html, in one command.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.MARKS_URL ?? "http://localhost:5199/marks.html";

/** Elements clipped straight out of the page, at their exact output size. */
const BLOCKS = [
  ["#tile1024", "client/public/logo.png"],
  ["#tile96", "client/public/favicon.png"],
  ["#wordmark", "android/app/src/main/res/drawable/gwinn_logo.png"],
  ["#og", "client/public/og-image.png"],
  // iOS ships a single 1024 master and downsamples on device.
  [
    "#tile1024",
    "ios/GwinnPOS/GwinnPOS/Assets.xcassets/AppIcon.appiconset/AppIcon.png",
  ],
];

/** Frame sizes inside favicon.ico. 48 is what Windows taskbars pick up. */
const ICO_SIZES = [16, 32, 48];

/**
 * An .ico is a 6-byte header, one 16-byte directory entry per frame, then the
 * frame payloads. PNG payloads (rather than BMP) are understood by every
 * browser in support and keep the alpha channel straightforward.
 */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  const dir = Buffer.alloc(16 * frames.length);
  let offset = header.length + dir.length;
  frames.forEach(({ size, png }, i) => {
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e + 0); // width (0 means 256)
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1); // height
    dir.writeUInt8(0, e + 2); // palette size — 0 for truecolour
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // colour planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.png)]);
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1100 } });
await page.goto(BASE);
// Cormorant Garamond sets the wordmark; a fallback face would silently ship.
await page.waitForFunction(() => document.fonts.status === "loaded");
const faces = await page.evaluate(() =>
  [
    ...new Set(
      [...document.fonts]
        .filter((f) => f.status === "loaded")
        .map((f) => f.family),
    ),
  ].join(", "),
);
console.log(`fonts loaded: ${faces || "NONE ⚠"}`);

for (const [selector, out] of BLOCKS) {
  await page.locator(selector).screenshot({ path: out });
  console.log(`wrote ${out}`);
}

const frames = [];
for (const size of ICO_SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.locator("#tileScalable").evaluate((el, s) => {
    el.style.width = `${s}px`;
    el.style.height = `${s}px`;
    const svg = el.querySelector("svg");
    svg.setAttribute("width", String(s));
    svg.setAttribute("height", String(s));
  }, size);
  frames.push({ size, png: await page.locator("#tileScalable").screenshot() });
}
writeFileSync("client/public/favicon.ico", buildIco(frames));
console.log(
  `wrote client/public/favicon.ico (${ICO_SIZES.join("/")}px frames)`,
);

await browser.close();
