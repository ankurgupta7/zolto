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
 * The light theme is a token contract, and a token the light block forgets is
 * not a compile error — it is a band that stays mahogany with mahogany text on
 * it, on one page, which is exactly the kind of thing a screenshot of the
 * homepage never reveals.
 */
describe("light mode", () => {
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
  const light = tokensIn('[data-theme="light"]');

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

  it("restates every band token, and moves all of them", () => {
    for (const token of BAND_TOKENS) {
      expect(light[token], token).toBeTruthy();
      expect(light[token], token).not.toBe(base[token]);
    }
  });

  /**
   * The lockup is themed by token rather than by a second SVG, so the light
   * block owes the mark a full set — a half-restated one gives a gold Z on a
   * near-white tile, which is 2.4:1 and disappears at favicon size.
   */
  it("recolours the whole lockup, ring included", () => {
    for (const token of [
      "--logo-tile",
      "--logo-mark",
      "--logo-dot",
      "--logo-ring",
    ]) {
      expect(light[token], token).toBeTruthy();
      expect(light[token], token).not.toBe(base[token]);
    }
  });

  /**
   * The particle field's colour and blend are one decision. Screen blend on
   * paper is invisible; multiply blend with the light gold is grey mud. Either
   * half changing alone is the bug.
   */
  it("flips the dust to multiply, since it is painted on paper now", () => {
    expect(base["--particle-blend"]).toBe("screen");
    expect(light["--particle-blend"]).toBe("multiply");
    expect(light["--particle-rgb"]).toBeTruthy();
    expect(light["--particle-rgb"]).not.toBe(base["--particle-rgb"]);
  });

  /**
   * The dark theme is the absence of the attribute. If the light rule were
   * keyed to `html` only, a component could not be themed in isolation — which
   * is what the logo review page relies on.
   */
  it("keys the theme off the attribute rather than off <html>", () => {
    expect(css).toContain('[data-theme="light"] {');
    expect(css).not.toContain('html[data-theme="light"]');
  });
});
