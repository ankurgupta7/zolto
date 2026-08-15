import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Privacy guards over the SPA shell.
 *
 * The shell used to load Google Fonts from fonts.googleapis.com and
 * Instagram's embed.js on every page, sending each visitor's IP to Google
 * and Meta before any consent could be asked. Fonts are now vendored into
 * client/public/fonts (tools/fonts/vendor-fonts.sh) and the embed script —
 * which nothing rendered — is gone. These tests keep both from creeping back,
 * and keep the vendored font bundle internally consistent.
 */

const clientDir = import.meta.dirname;
const html = readFileSync(path.join(clientDir, "index.html"), "utf8");
const fontsDir = path.join(clientDir, "public", "fonts");

describe("client/index.html third-party requests", () => {
  it("does not reference Google Fonts hosts", () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it("does not load Instagram's embed script", () => {
    expect(html).not.toMatch(/instagram\.com/);
  });

  it("links the first-party font stylesheet", () => {
    expect(html).toContain('href="/fonts/fonts.css"');
  });

  // The analytics tag is injected per request by server/analytics.ts. It used
  // to live here as `%VITE_ANALYTICS_ENDPOINT%/umami`, and neither variable was
  // defined anywhere in the repo — Vite leaves an undefined %VAR% verbatim, so
  // production shipped a script tag pointing at that literal string, which fell
  // through to the SPA catch-all and came back as HTML. Zero data collected,
  // while the privacy policy promised Umami in four languages.
  it("bakes in no analytics endpoint — a build-time constant cannot be absent", () => {
    expect(html).not.toContain("VITE_ANALYTICS_ENDPOINT");
    expect(html).not.toContain("VITE_ANALYTICS_WEBSITE_ID");
  });

  it("leaves no unsubstituted Vite placeholder of any kind in the shell", () => {
    // The general form of the bug above: any `%VITE_FOO%` that nothing defines
    // ships to production as a literal and fails silently.
    expect(html).not.toMatch(/%VITE_[A-Z0-9_]+%/);
  });
});

describe("vendored font bundle", () => {
  const css = readFileSync(path.join(fontsDir, "fonts.css"), "utf8");

  it("covers the three brand families", () => {
    for (const family of ["Cormorant Garamond", "Inter", "Caveat"]) {
      expect(css).toContain(`font-family: '${family}'`);
    }
  });

  it("references only local font files, all of which exist", () => {
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^\/fonts\/[\w.-]+\.woff2$/);
      expect(existsSync(path.join(fontsDir, path.basename(url)))).toBe(true);
    }
  });

  it("keeps text visible while fonts load (font-display: swap)", () => {
    const faces = css.match(/@font-face/g) ?? [];
    const swaps = css.match(/font-display: swap/g) ?? [];
    expect(faces.length).toBeGreaterThan(0);
    expect(swaps.length).toBe(faces.length);
  });
});
