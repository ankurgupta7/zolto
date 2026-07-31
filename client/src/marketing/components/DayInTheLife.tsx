import { SELLING_FLOW } from "@shared/platform";
import { useInView } from "@/hooks/useInView";
import { ScrollReveal } from "./ScrollReveal";

/**
 * DayInTheLife — the selling loop retold as one market day, scrolled through.
 *
 * The same three SELLING_FLOW steps the page always showed, but staged as a
 * timeline: a gold spine draws itself down the column as each step arrives, so
 * reading the section feels like moving through the day rather than scanning
 * three equal boxes. The time-of-day anchors come from the shared data, not
 * from here, so the story can't drift from the product copy.
 *
 * The spine is decorative only — every step's heading, time and detail is real
 * text in a real ordered list, so the section still reads correctly with
 * animation disabled, in a screen reader, and to a crawler.
 */
export function DayInTheLife() {
  // Pegged to the list itself: the spine fills once the sequence is reached,
  // rather than tracking scroll position frame by frame (which would mean a
  // scroll listener running on every marketing page view for one flourish).
  const { ref, inView } = useInView<HTMLOListElement>({ threshold: 0.2 });

  return (
    <ol ref={ref} className="relative mx-auto max-w-2xl">
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
        <ScrollReveal
          as="li"
          key={step.title}
          delay={i * 160}
          className="relative pb-10 last:pb-0 sm:pl-12"
        >
          {/* Numbered node, sitting on the spine. */}
          <span className="absolute left-0 top-0 hidden h-8 w-8 items-center justify-center rounded-full border border-[var(--brand-accent)] bg-[var(--brand-surface-2)] font-serif text-sm font-bold text-[var(--brand-ink)] tabular-nums sm:flex">
            {i + 1}
          </span>
          <p className="font-hand text-xl leading-none text-[var(--brand-accent)]">
            {step.timeOfDay}
          </p>
          <h3 className="mt-2 font-serif text-xl text-[var(--brand-text)]">
            {step.title}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--brand-muted-2)]">
            {step.detail}
          </p>
        </ScrollReveal>
      ))}
    </ol>
  );
}
