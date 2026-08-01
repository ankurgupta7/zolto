import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

/**
 * Serif numerals must ask for lining figures.
 *
 * Cormorant Garamond — the brand serif — defaults to *oldstyle* figures, where
 * 0 sits at x-height and 3/5/7/9 descend below the baseline. That renders
 * "CHF 0" as "CHF o" and "CHF 2,000" as "CHF 2,ooo": on a price, a legibility
 * failure rather than a stylistic quibble.
 *
 * `tabular-nums` does not fix it — figure *spacing* and figure *style* are
 * separate axes of font-variant-numeric, so `lining-nums` is also required.
 *
 * This is a source-level check on purpose. jsdom applies no real font, so no
 * DOM assertion can catch it; only a screenshot or this guard can. See
 * CLAUDE.md § "Screenshot every UI change".
 */

const SRC = path.resolve(__dirname, "..", "..");

function sourceFiles(): string[] {
  return globSync("**/*.tsx", { cwd: SRC })
    .filter((f) => !f.includes(".test."))
    .map((f) => path.join(SRC, f));
}

describe("serif numerals", () => {
  it("always pair font-serif + tabular-nums with lining-nums", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (
          line.includes("font-serif") &&
          line.includes("tabular-nums") &&
          !line.includes("lining-nums")
        ) {
          offenders.push(
            `${path.relative(SRC, file)}:${i + 1} — add lining-nums`,
          );
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("actually scans a meaningful number of files", () => {
    // Guards the guard: a broken glob would make the check above pass silently.
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  // The class-level check above cannot see this one: index.css puts the brand
  // serif on every h1-h6, so a heading inherits Cormorant without ever writing
  // `font-serif`. That is how "1 · Connect payments … 4 · Your TWINT QR
  // sticker" ended up with oldstyle step numbers on /admin/pos — every test
  // passed, and only the screenshot showed it.
  it("gives every serif heading lining figures at the source of the serif", () => {
    const css = readFileSync(path.join(SRC, "index.css"), "utf8");
    const headingRule = css.match(
      /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{[^}]*\}/,
    );

    expect(headingRule).not.toBeNull();
    expect(headingRule?.[0]).toContain("var(--font-serif)");
    expect(headingRule?.[0]).toContain("lining-nums");
  });
});
