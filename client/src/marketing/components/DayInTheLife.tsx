import type { ComponentType } from "react";
import { SELLING_FLOW } from "@shared/platform";
import { useInView } from "@/hooks/useInView";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";
import {
  StallOpensScene,
  TapToPayScene,
  ReconciliationEmailScene,
} from "./MarketingIllustrations";

/**
 * DayInTheLife — the selling loop retold as one market day, scrolled through.
 *
 * The same three SELLING_FLOW steps the page always showed, but staged as a
 * sequence: a gold spine draws itself down the column, and each beat's line-art
 * inks itself in as you reach it — the stall going up, the tap, the evening
 * email. Reading the section moves through the day rather than scanning three
 * equal boxes.
 *
 * The drawings are decorative (aria-hidden, no text of their own). Every step's
 * heading, time and detail is real copy in a real ordered list, so the section
 * reads correctly with animation disabled, in a screen reader, and to a
 * crawler. The time-of-day anchors come from the shared data, not from here, so
 * the story can't drift from the product copy.
 */

/**
 * One drawing per beat, in SELLING_FLOW's order. Kept as a positional list
 * rather than keyed off step titles: the copy is free to be reworded without
 * silently dropping the art. A step with no scene simply renders without one.
 */
const SCENES: ComponentType<{ className?: string }>[] = [
  StallOpensScene,
  TapToPayScene,
  ReconciliationEmailScene,
];

function Beat({
  step,
  index,
}: {
  step: (typeof SELLING_FLOW)[number];
  index: number;
}) {
  const { st } = useMarketingT();
  // Each beat inks itself in independently, so the sequence follows the reader
  // down the page instead of firing all at once when the section appears.
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 });
  const Scene = SCENES[index];

  return (
    <ScrollReveal
      as="li"
      delay={index * 160}
      className="relative pb-3.5 last:pb-0 sm:pb-12 sm:pl-12"
    >
      {/* Numbered node, sitting on the spine. */}
      <span className="absolute left-0 top-0 hidden h-8 w-8 items-center justify-center rounded-full border border-[var(--brand-accent)] bg-[var(--brand-surface-2)] font-serif text-sm font-bold text-[var(--brand-ink)] lining-nums tabular-nums sm:flex">
        {index + 1}
      </span>

      <div
        ref={ref}
        data-drawn={inView ? "true" : "false"}
        data-testid="day-beat"
        className="grid items-center gap-2 sm:grid-cols-[1fr_auto] sm:gap-6"
      >
        <div>
          <p className="font-hand text-xl leading-none text-[var(--brand-accent)]">
            {st(`sellingFlow.${index}.timeOfDay`, step.timeOfDay)}
          </p>
          <h3 className="mt-1.5 font-serif text-xl text-[var(--brand-text)] sm:mt-2">
            {st(`sellingFlow.${index}.title`, step.title)}
          </h3>
          <p className="mt-1.5 max-w-md text-[13px] leading-snug text-[var(--brand-muted-2)] sm:mt-2 sm:text-sm sm:leading-relaxed">
            {st(`sellingFlow.${index}.detail`, step.detail)}
          </p>
        </div>

        {Scene && (
          <Scene className="h-12 w-16 shrink-0 justify-self-start text-[var(--brand-accent)] sm:h-28 sm:w-36 sm:justify-self-end" />
        )}
      </div>
    </ScrollReveal>
  );
}

export function DayInTheLife() {
  // Pegged to the list itself: the spine fills once the sequence is reached,
  // rather than tracking scroll position frame by frame (which would mean a
  // scroll listener running on every marketing page view for one flourish).
  const { ref, inView } = useInView<HTMLOListElement>({ threshold: 0.2 });

  return (
    <ol ref={ref} className="relative mx-auto max-w-3xl">
      {/* The unfilled track + the gold spine that grows over it. */}
      <span
        aria-hidden
        className="absolute left-[15px] top-2 hidden h-[calc(100%-1rem)] w-px bg-[var(--brand-border)] sm:block"
      />
      <span
        aria-hidden
        data-testid="day-spine"
        className={`absolute left-[15px] top-2 hidden w-px origin-top bg-[var(--brand-accent)] transition-transform duration-[1600ms] ease-out motion-reduce:transition-none sm:block ${
          inView ? "scale-y-100" : "scale-y-0"
        }`}
        style={{ height: "calc(100% - 1rem)" }}
      />

      {SELLING_FLOW.map((step, i) => (
        <Beat key={step.title} step={step} index={i} />
      ))}
    </ol>
  );
}
