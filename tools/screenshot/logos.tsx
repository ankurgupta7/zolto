/**
 * Screenshot entry for the brush-Z lockup in both themes it has to survive.
 *
 * The mark is three tokens (--logo-tile / --logo-mark / --logo-dot, plus the
 * optional --logo-ring), so a theme can recolour it without a second SVG — and
 * a token swap is exactly the kind of change no unit test can see. This page
 * stands each colourway on the nav bar it will actually sit in, at the 32px it
 * actually renders at, next to a 16px copy: a lockup that reads as a gold Z at
 * hero size and as a smudge in a browser tab has not been checked.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL="http://localhost:5199/logos.html" node tools/screenshot/shoot.mjs out/
 */

import { createRoot } from "react-dom/client";
import "./entry.css";
import { BrushMark } from "@/marketing/components/MarketingChrome";

const ROWS = [
  {
    theme: undefined,
    name: "Dark",
    note: "gold Z on a mahogany tile",
  },
  {
    theme: "light" as const,
    name: "Light",
    note: "near-black Z on a hairline-ringed stone tile",
  },
];

/**
 * A nav bar's worth of context. The lockup is never seen on a swatch — it is
 * seen on --brand-ground, beside the wordmark, under a border — and a tile that
 * dissolves into that ground is the failure this page exists to catch.
 */
function LogoRow({
  theme,
  name,
  note,
}: {
  theme?: "light";
  name: string;
  note: string;
}) {
  return (
    <div
      data-theme={theme}
      className="border-b border-[var(--brand-border)] bg-[var(--brand-ground)] px-10 py-7"
    >
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          <BrushMark className="h-8 w-8" />
          <span className="font-serif text-xl tracking-tight text-[var(--brand-text)]">
            Gwinn
          </span>
        </div>
        <BrushMark className="h-4 w-4" />
        {/* On the band it also has to survive — the footer of a light page is
            one ground, the closing CTA slab is quite another. */}
        <span className="rounded-lg bg-band px-5 py-3">
          <BrushMark className="h-8 w-8" />
        </span>
        <div className="ml-auto text-right">
          <p className="text-sm font-medium text-[var(--brand-text)]">{name}</p>
          <p className="text-xs text-[var(--brand-muted-2)]">{note}</p>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <div className="font-sans">
    {ROWS.map((row) => (
      <LogoRow key={row.name} {...row} />
    ))}
  </div>,
);
