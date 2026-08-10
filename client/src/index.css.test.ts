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
