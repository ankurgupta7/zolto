import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.join(process.cwd(), "client/src/index.css"),
  "utf-8",
);

/**
 * A transformed element is the containing block for its `position: fixed`
 * descendants, so a page-level wrapper that keeps a transform silently
 * re-anchors every fixed overlay rendered inside it — the overlay lands offset
 * from its own coordinates and scrolls with the document instead of the
 * viewport. That is what broke the admin guided tour. `.page-enter` is on
 * nearly every page, so it is the wrapper most likely to do this.
 */
/**
 * The homepage reel makes its own scroll container and sizes every chapter as
 * `calc(100dvh - var(--nav-height))` (see marketing/components/ReelStage.tsx).
 * If the token disappears, `calc()` is invalid and each chapter collapses to
 * its content height — the whole treatment silently stops being a reel.
 */
describe("--nav-height", () => {
  it("is defined on :root, in rem", () => {
    const declaration = css.match(/--nav-height:\s*([^;]+);/);
    expect(declaration).toBeTruthy();
    expect(declaration?.[1].trim()).toMatch(/^[\d.]+rem$/);
  });
});

describe(".page-enter entrance animation", () => {
  const rule = css.match(/\.page-enter\s*\{[^}]*\}/)?.[0] ?? "";

  it("exists and runs the fadeUp entrance", () => {
    expect(rule).toContain("fadeUp");
  });

  it("does not fill forwards, so no transform outlives the animation", () => {
    expect(rule).not.toContain("forwards");
    expect(rule).not.toContain("both");
  });

  it("still ends at the element's resting state, so dropping the fill is a no-op visually", () => {
    const keyframes = css.match(/@keyframes fadeUp\s*\{[\s\S]*?\n {2}\}/)?.[0];
    expect(keyframes).toBeTruthy();
    const to = keyframes?.split(/\bto\b\s*\{/)[1] ?? "";
    expect(to).toContain("opacity: 1");
    expect(to).toContain("translateY(0)");
  });
});

/**
 * The light theme is a token contract, and a token the light blocks forget is
 * not a compile error — it is a band that stays mahogany with mahogany text on
 * it, on one page, in one palette, which is exactly the kind of thing a
 * screenshot of the homepage never reveals.
 */
describe("light mode", () => {
  const PALETTES = ["parchment", "porcelain", "goldleaf"] as const;

  /** The declarations inside a rule, as a { property: value } map. */
  function tokensIn(selector: string): Record<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const body = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
    if (!body) return {};
    return Object.fromEntries(
      [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
        m[1],
        m[2].trim(),
      ]),
    );
  }

  const base = tokensIn(":root");
  // The default light palette lives on the bare attribute; the other two add
  // data-light and inherit everything they don't restate.
  const parchment = tokensIn('[data-theme="light"]');

  /**
   * Every token whose whole job is "this is the dark half of the palette".
   * A band left mahogany while its copy went dark is unreadable, and vice
   * versa, so they are checked as a group rather than one at a time.
   */
  const BAND_TOKENS = [
    "--brand-band",
    "--brand-band-deep",
    "--brand-band-fg",
    "--brand-ground",
    "--brand-surface",
    "--brand-text",
    "--brand-accent",
    "--brand-accent-fg",
    "--brand-border",
  ];

  it("defines the band and logo tokens on :root, so dark needs no attribute", () => {
    for (const token of [
      "--brand-band",
      "--brand-band-deep",
      "--brand-band-fg",
      "--brand-accent-fg",
      "--logo-tile",
      "--logo-mark",
      "--logo-dot",
      "--logo-ring",
      "--particle-rgb",
      "--particle-blend",
    ]) {
      expect(base[token], token).toBeTruthy();
    }
    // Today's look, unchanged: the bands were mahogany with white copy.
    expect(base["--brand-band"]).toBe("#2d2620");
    expect(base["--brand-band-fg"]).toBe("#ffffff");
  });

  it("restates every band token in the default light palette", () => {
    for (const token of BAND_TOKENS) {
      expect(parchment[token], token).toBeTruthy();
      expect(parchment[token], token).not.toBe(base[token]);
    }
  });

  it("gives each palette its own band and its own lockup", () => {
    const seenBands = new Set([
      base["--brand-band"],
      parchment["--brand-band"],
    ]);
    const seenTiles = new Set([base["--logo-tile"], parchment["--logo-tile"]]);
    for (const palette of PALETTES.slice(1)) {
      const tokens = tokensIn(`[data-theme="light"][data-light="${palette}"]`);
      expect(tokens["--brand-band"], palette).toBeTruthy();
      expect(tokens["--logo-tile"], palette).toBeTruthy();
      seenBands.add(tokens["--brand-band"]);
      seenTiles.add(tokens["--logo-tile"]);
    }
    // A palette that resolves to the same band as another is not an
    // alternative, it is a duplicate.
    expect(seenBands.size).toBe(PALETTES.length + 1);
    expect(seenTiles.size).toBe(PALETTES.length + 1);
  });

  /**
   * The particle field's colour and blend are one decision. Screen blend on
   * paper is invisible; multiply blend with the light gold is grey mud. Either
   * half changing alone is the bug.
   */
  it("flips the dust to multiply wherever it is painted on paper", () => {
    expect(base["--particle-blend"]).toBe("screen");
    for (const palette of PALETTES) {
      const tokens =
        palette === "parchment"
          ? parchment
          : tokensIn(`[data-theme="light"][data-light="${palette}"]`);
      expect(tokens["--particle-blend"], palette).toBe("multiply");
      expect(tokens["--particle-rgb"], palette).toBeTruthy();
    }
  });

  /**
   * The dark theme is the absence of the attribute. If a light rule were keyed
   * to `html` only, a component could not be themed in isolation — which is
   * what the logo review page and any single-band test rely on.
   */
  it("keys the palettes off the attribute rather than off <html>", () => {
    expect(css).toContain('[data-theme="light"] {');
    expect(css).not.toContain('html[data-theme="light"]');
  });
});
