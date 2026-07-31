import { useEffect, useRef, useState } from "react";

/**
 * useInView — fires once when an element first scrolls into view.
 *
 * Backs the marketing site's scroll-reveal treatment. Deliberately one-shot:
 * content that fades back out as you scroll up reads as a glitch on a page
 * people scroll both ways, so once revealed an element stays revealed.
 *
 * Degrades to "always visible" wherever the observation can't happen —
 * jsdom (tests), older browsers without IntersectionObserver, and whenever the
 * visitor asks for reduced motion. Copy is never hidden behind an animation
 * that might not run.
 */

interface UseInViewOptions {
  /** Fraction of the element that must be visible before it counts. */
  threshold?: number;
  /** Margin around the viewport, e.g. "0px 0px -80px 0px" to trigger early. */
  rootMargin?: string;
}

export function useInView<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.15,
  rootMargin = "0px 0px -60px 0px",
}: UseInViewOptions = {}) {
  const ref = useRef<T>(null);
  // Start hidden only when we can actually observe our way out of it.
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, inView };
}
