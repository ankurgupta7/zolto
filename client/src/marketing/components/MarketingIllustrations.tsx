import type { ReactNode } from "react";
import { Store, Smartphone, Sparkles } from "lucide-react";
import { SketchArrow } from "@/components/SketchAccents";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

/**
 * Marketing illustrations — the "show what Gwinn does" visuals for the landing
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
    <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr] md:gap-6">
      {/* Channel: market stall / POS */}
      <ChannelCard
        icon={Smartphone}
        eyebrow="In person"
        title="Market stall"
        detail="Tap to Pay, cash & TWINT"
        stock="12 in stock"
      />

      {/* Center: one inventory */}
      {/* Below md the arrows are hidden and this is just the node stacked
          between the two cards, so it carries no vertical padding there — the
          diagram shares a phone screen with its heading in the homepage reel. */}
      <div className="relative flex flex-col items-center justify-center px-2 md:py-4">
        {/* Arrows fan out to both channels; flipped horizontally on the left. */}
        <SketchArrow className="absolute left-[-3.5rem] top-1/2 hidden h-8 w-16 -translate-y-1/2 -scale-x-100 text-[var(--brand-accent)] md:block" />
        <SketchArrow className="absolute right-[-3.5rem] top-1/2 hidden h-8 w-16 -translate-y-1/2 text-[var(--brand-accent)] md:block" />
        <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-[var(--brand-ink)] bg-[var(--brand-surface-2)] text-center tall:max-md:h-20 tall:max-md:w-20 md:h-24 md:w-24">
          <span className="font-serif text-xl leading-none text-[var(--brand-ink)] lining-nums tabular-nums tall:text-2xl">
            12
          </span>
          {/* Sized to the circle it sits in, not to the desktop one: at 0.14em
              tracking "INVENTORY" is 85px wide, which spilled straight out of
              the 64px node a short phone gets. */}
          <span className="mt-0.5 text-[9px] uppercase leading-tight tracking-[0.08em] text-[var(--brand-muted)] tall:mt-1 md:text-[10px] md:tracking-[0.14em]">
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
    <div className="rounded-lg border border-[var(--brand-border)] bg-white p-4 md:p-5">
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
      <p className="mt-2 text-sm text-[var(--brand-muted-2)] md:mt-3">
        {detail}
      </p>
      <p className="mt-2 inline-flex md:mt-3 items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-emerald-700">
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
    // Before and after sit beside each other at every width. Stacked, the pair
    // is 550px on a 375px phone — most of a screen spent on one drawing — and a
    // before/after only lands as a comparison anyway when you can see both.
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
      {/* Before: a hand-framed snapshot */}
      <figure className="relative mx-auto w-full max-w-[11rem] sm:max-w-xs">
        <div className="rounded-[0.4rem] border-2 border-dashed border-[var(--brand-accent)]/60 bg-[var(--brand-surface-2)] p-2 sm:p-3">
          <div className="flex aspect-[4/3] items-center justify-center rounded-sm bg-[var(--brand-surface-3)]">
            <NecklaceSketch className="h-[78%] w-[82%] text-[var(--brand-muted)]" />
          </div>
          <figcaption className="font-hand mt-2 text-center leading-tight text-[var(--brand-accent)]">
            just your phone photo
          </figcaption>
        </div>
      </figure>

      {/* Arrow with an AI marker */}
      <div className="flex flex-col items-center gap-1 text-[var(--brand-accent)]">
        <Sparkles size={16} />
        <SketchArrow className="h-5 w-8 sm:h-6 sm:w-16" />
      </div>

      {/* After: a crisp generated listing */}
      <div className="mx-auto w-full max-w-[15rem] rounded-lg border border-[var(--brand-border)] bg-white p-2 shadow-sm sm:max-w-xs sm:p-4">
        <div className="flex aspect-[4/3] items-center justify-center rounded-sm bg-gradient-to-br from-[var(--brand-surface)] to-[var(--brand-surface-3)]">
          <NecklaceSketch
            crisp
            className="h-[78%] w-[82%] text-[var(--brand-accent)]"
          />
        </div>
        <p className="mt-2 font-serif text-sm leading-tight text-[var(--brand-text)] sm:mt-3 sm:text-base">
          Moonstone Pendant Necklace
        </p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--brand-muted-2)] sm:text-xs sm:leading-relaxed">
          Sterling silver chain, 8&nbsp;mm rainbow moonstone drop. Handmade in
          Zürich.
        </p>
        {/* "in every language you sell in" — shown rather than said. This is
            the clause the caption beside the drawing used to spend eight words
            on; as four ISO codes it needs none, and it needs no translating
            either, which is why they are codes and not language names. The
            first is lit because that is the one being displayed. */}
        <ul
          data-testid="listing-languages"
          aria-label="Written in German, French, Italian and English"
          className="mt-1.5 flex gap-1 sm:mt-2"
        >
          {SUPPORTED_LANGUAGES.map((code, i) => (
            <li
              key={code}
              className={`rounded-sm px-1 py-px text-[9px] font-medium uppercase tracking-[0.1em] sm:text-[10px] ${
                i === 0
                  ? "bg-[var(--brand-accent)]/20 text-[var(--brand-ink)]"
                  : "text-[var(--brand-muted)]"
              }`}
            >
              {code}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 font-serif text-base text-[var(--brand-ink)] lining-nums tabular-nums sm:mt-2 sm:text-lg">
          CHF 180
        </p>
      </div>
    </div>
  );
}

/**
 * The three beats of a market day, drawn in the same loose pen as the hero
 * stall: the stall goes up, a sale happens, the day's email lands.
 *
 * They share a 120×100 frame so the trio reads as one sequence rather than
 * three unrelated drawings, and every stroke carries `pathLength={1}` so the
 * `.sketch-draw` CSS can ink them in at a uniform rate as they scroll into
 * view (see index.css). All three are decorative: the caption beside each one
 * carries the meaning, so nothing is lost when the drawing isn't seen.
 */

/**
 * A phone-shaped till, drawn in the same pen as the scenes below it.
 *
 * `has` decides what's on the screen and in the payment row, so the drawing is
 * generated from the same data as the claim beside it (POSITIONING.squeezePlay)
 * rather than hand-drawn per panel. A panel cannot end up showing a capability
 * the copy doesn't grant it, which is the whole reason this argument is worth
 * making as a picture: three phones side by side make "one of these has both"
 * a thing you see before you read it.
 *
 * Four constraints, each from a trap this repo has already fallen into:
 *
 *  - **No `<text>` anywhere.** Labels render as HTML beneath each panel so they
 *    go through `st()` like every other string. Text baked into an SVG is
 *    invisible to the four-language key-parity check in locales.test.ts.
 *  - **No numerals.** Prices are suggested with a short rule, the way
 *    TapToPayScene suggests an amount — which also sidesteps Cormorant's
 *    oldstyle figures rendering money as letters.
 *  - **No TWINT logo.** The mark is trademarked, and a QR glyph is the honest
 *    depiction anyway: TWINT at a stall *is* a QR scan.
 *  - **`role="img"` with a real title**, not `aria-hidden`. Unlike the
 *    decorative scenes, this one carries the argument.
 */
export function SqueezePlayTill({
  has,
  title,
  className,
}: {
  has: readonly string[];
  title: string;
  className?: string;
}) {
  const hasGrid = has.includes("grid");
  const hasTwint = has.includes("twint");

  // Two columns × three rows of wares, on the screen of a phone held upright.
  const cells = [15, 43].flatMap((x) =>
    [19, 46, 73].map((y) => ({ x, y, key: `${x}-${y}` })),
  );

  return (
    <svg
      className={className}
      viewBox="0 0 80 140"
      fill="none"
      role="img"
      focusable="false"
    >
      <title>{title}</title>
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* The handset */}
        <rect x="4" y="2" width="72" height="136" rx="9" />
        <path d="M32 9 L48 9" />

        {hasGrid ? (
          // Your actual objects, each with the suggestion of a price under it.
          cells.map(({ x, y, key }) => (
            <g key={key}>
              <rect x={x} y={y} width="22" height="17" rx="2" />
              <path d={`M${x} ${y + 21} L${x + 13} ${y + 21}`} />
            </g>
          ))
        ) : (
          // No catalogue: an amount field and a keypad, typed in every time.
          <>
            <rect x="15" y="19" width="50" height="16" rx="2" />
            <path d="M21 27 L37 27" />
            {[48, 64, 80].map((cy) =>
              [23, 40, 57].map((cx) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5" />
              )),
            )}
          </>
        )}

        {/* The payment row along the bottom of the screen. Deliberately large
            relative to the wares above it: at the size these panels render on
            a phone, the first draft's 16-unit glyphs collapsed into specks and
            the strike over the QR read as a smudge rather than as an absence. */}
        {/* QR — a finder pattern, not the TWINT mark, which is trademarked. */}
        <rect x="10" y="103" width="20" height="20" rx="2" />
        <rect x="14" y="107" width="4.5" height="4.5" />
        <rect x="21.5" y="107" width="4.5" height="4.5" />
        <rect x="14" y="114.5" width="4.5" height="4.5" />
        {!hasTwint && (
          // Struck through: this till cannot take it. Overshoots the glyph at
          // both ends and is drawn heavier than it, so the cancel reads even
          // when the panel is a third of its desktop width.
          <path d="M5 128 L35 98" strokeWidth="2.8" />
        )}

        {/* Contactless — every till in this market has this now. */}
        <path d="M38 106 q 4.5 7 0 14" />
        <path d="M44 102 q 7 11 0 22" />

        {/* Cash — a note, not coins. Two small circles at this scale read as
            an ampersand, which is not a payment method. */}
        {hasGrid && hasTwint && (
          <>
            <rect x="53" y="105" width="19" height="14" rx="1.5" />
            <circle cx="62.5" cy="112" r="3" />
          </>
        )}
      </g>
    </svg>
  );
}

/** Shared frame + pen settings, so the three scenes can't drift apart. */
function SceneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 100"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      <g
        className="sketch-draw"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {children}
      </g>
    </svg>
  );
}

/** Beat one — the canopy goes up and the wares come out. */
export function StallOpensScene({ className }: { className?: string }) {
  return (
    <SceneFrame className={className}>
      {/* Canopy */}
      <path pathLength={1} d="M12 30 Q 60 16 108 30" />
      <path pathLength={1} d="M12 30 L 18 43 Q 60 31 102 43 L 108 30" />
      {/* Valance ticks hanging off the hem — what makes it read as a market
          awning rather than a shelter roof. Points sit on the hem curve. */}
      <path pathLength={1} d="M39 38.5 L 37 44" />
      <path pathLength={1} d="M60 37 L 60 43" />
      <path pathLength={1} d="M81 38.5 L 83 44" />
      {/* Posts */}
      <path pathLength={1} d="M19 43 L 19 86" />
      <path pathLength={1} d="M101 43 L 101 86" />
      {/* Trestle table */}
      <path pathLength={1} d="M30 72 L 90 72" />
      <path pathLength={1} d="M35 72 L 35 87" />
      <path pathLength={1} d="M85 72 L 85 87" />
      {/* Wares, resting on the table line rather than hovering over it:
          a ring, a draped necklace, a little box */}
      <circle pathLength={1} cx="46" cy="67" r="4.5" />
      <circle pathLength={1} cx="46" cy="67" r="1.6" />
      <path pathLength={1} d="M60 64 q 8 11 16 0" />
      <path pathLength={1} d="M82 63 l 9 0 l 0 9 l -9 0 z" />
    </SceneFrame>
  );
}

/** Beat two — a customer taps their phone against the maker's. */
export function TapToPayScene({ className }: { className?: string }) {
  return (
    <SceneFrame className={className}>
      {/* The maker's phone, held out */}
      <rect pathLength={1} x="20" y="22" width="34" height="60" rx="5" />
      {/* Amount line on its screen — suggestion of a figure, not a real one */}
      <path pathLength={1} d="M28 40 L 46 40" />
      <path pathLength={1} d="M28 49 L 40 49" />
      {/* The customer's phone, angled in from the right */}
      <rect
        pathLength={1}
        x="78"
        y="30"
        width="26"
        height="44"
        rx="4"
        transform="rotate(14 91 52)"
      />
      {/* Contactless arcs arcing across the gap */}
      <path pathLength={1} d="M60 44 q 6 8 0 16" />
      <path pathLength={1} d="M66 39 q 9 13 0 26" />
      <path pathLength={1} d="M72 34 q 12 18 0 36" />
    </SceneFrame>
  );
}

/** Beat three — the day's reconciliation email arrives. */
export function ReconciliationEmailScene({
  className,
}: {
  className?: string;
}) {
  return (
    <SceneFrame className={className}>
      {/* Envelope body + flap */}
      <rect pathLength={1} x="16" y="26" width="88" height="56" rx="4" />
      <path pathLength={1} d="M16 30 L 60 58 L 104 30" />
      {/* The day's lines, sitting on the flap like a little list */}
      <path pathLength={1} d="M34 68 L 62 68" />
      <path pathLength={1} d="M34 75 L 54 75" />
      {/* Confirmed — the one tap that closes the day */}
      <path pathLength={1} d="M74 70 l 5 6 l 11 -13" />
    </SceneFrame>
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
