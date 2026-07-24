import { Store, Smartphone, Sparkles } from "lucide-react";
import { SketchArrow } from "@/components/SketchAccents";

/**
 * Marketing illustrations — the "show what Zolto does" visuals for the landing
 * page. Built as warm HTML + light SVG line-art rather than stock photography:
 * honest, on-brand, and self-contained (no external image assets).
 *
 * The handcrafted brand voice lives in the frame — sketch arrows, a line-drawn
 * market stall, handwritten annotations. Anything a maker reads as a fact
 * (a stock count, a price) stays crisp, per the storefront's design guardrail.
 */

/**
 * "One inventory → two channels." A central stock node with hand-drawn arrows
 * out to the market-stall (POS) and online-store channels, the SAME count
 * echoed on both sides to make "stays in sync" literal.
 */
export function OneInventoryDiagram() {
  return (
    <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
      {/* Channel: market stall / POS */}
      <ChannelCard
        icon={Smartphone}
        eyebrow="In person"
        title="Market stall"
        detail="Tap to Pay, cash & TWINT"
        stock="12 in stock"
      />

      {/* Center: one inventory */}
      <div className="relative flex flex-col items-center justify-center px-2 py-4">
        {/* Arrows fan out to both channels; flipped horizontally on the left. */}
        <SketchArrow className="absolute left-[-3.5rem] top-1/2 hidden h-8 w-16 -translate-y-1/2 -scale-x-100 text-[var(--brand-accent)] md:block" />
        <SketchArrow className="absolute right-[-3.5rem] top-1/2 hidden h-8 w-16 -translate-y-1/2 text-[var(--brand-accent)] md:block" />
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-[var(--brand-ink)] bg-[var(--brand-surface-2)] text-center">
          <span className="font-serif text-2xl leading-none text-[var(--brand-ink)] tabular-nums">
            12
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--brand-muted)]">
            One
            <br />
            inventory
          </span>
        </div>
      </div>

      {/* Channel: online store */}
      <ChannelCard
        icon={Store}
        eyebrow="Online"
        title="Web storefront"
        detail="Cards & TWINT checkout"
        stock="12 in stock"
      />
    </div>
  );
}

function ChannelCard({
  icon: Icon,
  eyebrow,
  title,
  detail,
  stock,
}: {
  icon: typeof Store;
  eyebrow: string;
  title: string;
  detail: string;
  stock: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--brand-border)] bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
          <Icon size={18} strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--brand-muted)]">
            {eyebrow}
          </p>
          <p className="font-serif text-lg leading-tight text-[var(--brand-text)]">
            {title}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-[var(--brand-muted-2)]">{detail}</p>
      <p className="mt-3 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-emerald-700">
        {stock}
      </p>
    </div>
  );
}

/**
 * The pendant that hangs at the low point of the necklace: a bail loop above a
 * teardrop moonstone. `crisp` toggles the "generated listing" polish — inner
 * facet lines that read as a cut gem. Drawn around a local origin at the bail so
 * the necklace can drop it in with a single translate.
 */
function Pendant({ crisp }: { crisp: boolean }) {
  return (
    <>
      {/* Bail — the little loop the chain threads through. */}
      <circle cx="0" cy="0" r="2.4" />
      {/* Drop stone — a teardrop, pointed at the top where it hangs. */}
      <path d="M0 4 C 11 17, 11 34, 0 44 C -11 34, -11 17, 0 4 Z" />
      {crisp && (
        <>
          {/* Facet lines — only the polished listing shows the cut. */}
          <path d="M-9 22 L 9 22" opacity="0.55" />
          <path d="M0 4 L 0 44" opacity="0.55" />
        </>
      )}
    </>
  );
}

/**
 * A minimal line-art necklace — a draped chain that dips to a central moonstone
 * pendant, filling the frame the way a hero product shot would. `crisp` swaps
 * the loose snapshot for the polished version: bolder strokes, faceted stone,
 * beaded chain and a little sparkle, so the before/after frames carry the actual
 * product instead of a generic placeholder icon. Decorative & aria-hidden.
 */
export function NecklaceSketch({
  crisp = false,
  className,
}: {
  crisp?: boolean;
  className?: string;
}) {
  // Where the two chain strands meet the pendant's bail.
  const dip = { x: 65, y: 40 };
  return (
    <svg
      className={className}
      viewBox="0 0 130 88"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      <g
        stroke="currentColor"
        strokeWidth={crisp ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* The chain: draped from both clasps down to the pendant's bail. */}
        <path
          d={`M14 8 C 26 30, 46 ${dip.y}, ${dip.x} ${dip.y} C 84 ${dip.y}, 104 30, 116 8`}
        />
        {/* Clasp ends at the top of each strand. */}
        <circle cx="14" cy="8" r="1.8" />
        <circle cx="116" cy="8" r="1.8" />
        {/* Pendant hangs from the dip. */}
        <g transform={`translate(${dip.x} ${dip.y + 3})`}>
          <Pendant crisp={crisp} />
        </g>
        {crisp && (
          /* Beads strung along the chain — the strand reads richer up close. */
          <g fill="currentColor" stroke="none" opacity="0.7">
            <circle cx="30" cy="21" r="1.5" />
            <circle cx="45" cy="31" r="1.5" />
            <circle cx="85" cy="31" r="1.5" />
            <circle cx="100" cy="21" r="1.5" />
          </g>
        )}
      </g>
      {crisp && (
        /* A single four-point sparkle — the "freshly generated" flourish. */
        <path
          d="M104 60 l1.7 4.6 l4.6 1.7 l-4.6 1.7 l-1.7 4.6 l-1.7 -4.6 l-4.6 -1.7 l4.6 -1.7 z"
          fill="currentColor"
          opacity="0.7"
        />
      )}
    </svg>
  );
}

/**
 * "Photo → listing." A sketched photo frame on the left becomes a crisp,
 * ready-to-publish listing on the right — the AI "wow" made literal. The photo
 * side wears the pen; the generated listing (title, price) stays crisp.
 */
export function PhotoToListing() {
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
      {/* Before: a hand-framed snapshot */}
      <figure className="relative mx-auto w-full max-w-xs">
        <div className="rounded-[0.4rem] border-2 border-dashed border-[var(--brand-accent)]/60 bg-[var(--brand-surface-2)] p-3">
          <div className="flex aspect-[4/3] items-center justify-center rounded-sm bg-[var(--brand-surface-3)]">
            <NecklaceSketch className="h-[78%] w-[82%] text-[var(--brand-muted)]" />
          </div>
          <figcaption className="font-hand mt-2 text-center text-[var(--brand-accent)]">
            just your phone photo
          </figcaption>
        </div>
      </figure>

      {/* Arrow with an AI marker */}
      <div className="flex flex-col items-center gap-1 text-[var(--brand-accent)]">
        <Sparkles size={16} />
        <SketchArrow className="h-6 w-16 rotate-90 sm:rotate-0" />
      </div>

      {/* After: a crisp generated listing */}
      <div className="mx-auto w-full max-w-xs rounded-lg border border-[var(--brand-border)] bg-white p-4 shadow-sm">
        <div className="flex aspect-[4/3] items-center justify-center rounded-sm bg-gradient-to-br from-[var(--brand-surface)] to-[var(--brand-surface-3)]">
          <NecklaceSketch
            crisp
            className="h-[78%] w-[82%] text-[var(--brand-accent)]"
          />
        </div>
        <p className="mt-3 font-serif text-base leading-tight text-[var(--brand-text)]">
          Moonstone Pendant Necklace
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--brand-muted-2)]">
          Sterling silver chain, 8&nbsp;mm rainbow moonstone drop. Handmade in
          Zürich.
        </p>
        <p className="mt-2 font-serif text-lg text-[var(--brand-ink)] tabular-nums">
          CHF 180
        </p>
      </div>
    </div>
  );
}

/**
 * A loose, line-drawn market-stall scene — decorative hero motif. Purely
 * atmospheric: aria-hidden, currentColor so the caller sets the ink.
 */
export function MarketStallScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 200"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Canopy — a slightly wavy striped awning */}
        <path d="M20 60 Q 160 40 300 60" />
        <path d="M20 60 L 30 84 Q 160 66 290 84 L 300 60" />
        <path d="M70 71 L 62 88 M120 67 L 114 90 M170 66 L 168 91 M220 67 L 226 90 M270 71 L 280 88" />
        {/* Posts */}
        <path d="M32 84 L 32 170 M288 84 L 288 170" />
        {/* Table */}
        <path d="M52 150 L 268 150 M60 150 L 60 172 M260 150 L 260 172" />
        {/* Wares on the table — rings, a necklace, little boxes */}
        <circle cx="96" cy="140" r="8" />
        <circle cx="96" cy="140" r="3" />
        <path d="M140 132 q 18 22 36 0" />
        <circle cx="140" cy="132" r="2.5" />
        <circle cx="176" cy="132" r="2.5" />
        <path d="M212 132 l 22 0 l 0 16 l -22 0 z" />
        {/* Little "sold" tag */}
        <path d="M236 120 l 14 -8 l 8 10 l -14 8 z" />
        <circle cx="248" cy="118" r="1.6" />
      </g>
    </svg>
  );
}
