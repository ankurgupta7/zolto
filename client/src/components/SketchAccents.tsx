/**
 * SketchAccents — decorative, hand-drawn pen strokes.
 *
 * These exist purely to carry the artisan/handcrafted brand voice on the
 * merchant dashboard. They are intentionally NON-functional: `aria-hidden`,
 * `pointer-events: none`, and drawn in `currentColor` so a parent sets the hue
 * (usually the gold accent). Per the dashboard's design rule, hand-drawn marks
 * decorate the frame — headings, dividers, empty states — and never touch data,
 * money, tables, inputs, or status pills.
 */

type SketchProps = {
  className?: string;
};

/**
 * A rough, slightly wavy underline stroke — sits under a heading to read like a
 * pen swipe. Scales to the width of its container; height stays small.
 */
export function SketchUnderline({ className }: SketchProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 12"
      preserveAspectRatio="none"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{
        width: "100%",
        height: "0.55rem",
        pointerEvents: "none",
        display: "block",
      }}
    >
      {/* Two offset strokes give the doubled-back look of a real pen underline. */}
      <path
        d="M2 7 C 40 3, 70 10, 104 6 S 168 3, 198 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M8 10 C 52 8, 96 11, 150 9 S 182 10, 194 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

/**
 * A full-width wavy divider — the hand-inked counterpart to `.divider-gold`.
 * Use to separate decorative bands, not data rows.
 */
export function SketchDivider({ className }: SketchProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 10"
      preserveAspectRatio="none"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{
        width: "100%",
        height: "0.5rem",
        pointerEvents: "none",
        display: "block",
      }}
    >
      <path
        d="M2 5 Q 25 1, 50 5 T 100 5 T 150 5 T 200 5 T 250 5 T 300 5 T 350 5 T 398 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A rough circular pen-loop, used to ring an icon or glyph in decorative zones
 * (capability band, empty state). Absolutely positioned by the caller.
 */
export function SketchCircle({ className }: SketchProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      <path
        d="M32 4 C 50 3, 61 16, 60 33 C 59 51, 46 61, 30 60 C 13 59, 3 46, 4 30 C 5 15, 16 5, 33 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
