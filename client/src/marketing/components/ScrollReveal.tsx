import type { ElementType, ReactNode } from "react";
import { useInView } from "@/hooks/useInView";

/**
 * ScrollReveal — fades + lifts its children the first time they scroll into
 * view, so the marketing page unfolds as you read it instead of arriving all at
 * once.
 *
 * The motion is deliberately small (a 16px lift, no scale, no bounce): this is
 * a site selling honesty to craftspeople, and a page that leaps around
 * undercuts that. `delay` staggers siblings — pass the index of a list item.
 *
 * Accessibility: the reveal is a pure opacity/transform treatment layered on
 * top of already-rendered DOM, so the copy is present for screen readers and
 * for crawlers regardless of whether the animation ever runs. `useInView`
 * short-circuits to visible under `prefers-reduced-motion`.
 */
export function ScrollReveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Element to render — keeps list semantics intact (e.g. `as="li"`). */
  as?: ElementType;
  /** Stagger in ms. */
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Tag
      ref={ref}
      data-testid="scroll-reveal"
      data-in-view={inView ? "true" : "false"}
      style={{ transitionDelay: inView ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
        inView ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
