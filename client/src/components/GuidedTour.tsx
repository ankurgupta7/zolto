import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  computeTooltipPosition,
  isTourCompleted,
  markTourCompleted,
  nextStepIndex,
  positionsEqual,
  rectsEqual,
  TOOLTIP_FALLBACK_HEIGHT,
  tooltipWidthFor,
  type Rect,
  type TourStep,
  type TooltipPosition,
} from "@/lib/tour";

interface GuidedTourProps {
  /** Stable id used to remember completion (localStorage). */
  tourId: string;
  steps: TourStep[];
  /** Auto-start on mount for users who haven't seen it. Default true. */
  autoStart?: boolean;
  /** Controlled restart signal — bump this number to (re)start the tour. */
  startSignal?: number;
  onFinish?: () => void;
}

/**
 * Resolve a step's target, preferring a *rendered* match. Several anchors are
 * duplicated across responsive variants (e.g. a mobile and a desktop "Connect
 * Stripe"), and `querySelector` would happily hand back the hidden one — whose
 * zero-size rect would park the spotlight in the top-left corner.
 */
function findTarget(selector: string): Element | null {
  const matches = Array.from(document.querySelectorAll(selector));
  for (const el of matches) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return matches[0] ?? null;
}

/**
 * A lightweight coach-mark / product-tour overlay: dims the page, spotlights one
 * target element at a time, and shows an arrow + tooltip with Back / Next / Skip.
 * Purely presentational logic lives in `@/lib/tour` (tested there).
 *
 * Rendered through a portal on `document.body`: a positioned or transformed
 * ancestor (`.page-enter` animates a transform; page sections position
 * themselves) would become the containing block for the overlay's boxes, so
 * mounted in place its document-origin coordinates would be re-anchored to
 * whatever ancestor happened to qualify. On the body they mean what they say.
 */
export default function GuidedTour({
  tourId,
  steps,
  autoStart = true,
  startSignal,
  onFinish,
}: GuidedTourProps) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<TooltipPosition | null>(null);
  const [tipWidth, setTipWidth] = useState(() =>
    tooltipWidthFor(typeof window === "undefined" ? 360 : window.innerWidth),
  );
  const tipRef = useRef<HTMLDivElement | null>(null);

  const step = steps[index];

  const finish = useCallback(
    (completed: boolean) => {
      setActive(false);
      if (completed) markTourCompleted(tourId);
      onFinish?.();
    },
    [tourId, onFinish],
  );

  // Auto-start once for first-time users.
  useEffect(() => {
    if (autoStart && steps.length > 0 && !isTourCompleted(tourId)) {
      setIndex(0);
      setActive(true);
    }
  }, [autoStart, steps.length, tourId]);

  // Controlled restart (e.g. a "Replay tour" button). The initial signal value is
  // ignored — only later changes restart — so it doesn't override the completion
  // check that governs auto-start for returning users.
  const signalSeen = useRef(false);
  useEffect(() => {
    if (startSignal === undefined) return;
    if (!signalSeen.current) {
      signalSeen.current = true;
      return;
    }
    if (steps.length === 0) return;
    setIndex(0);
    setActive(true);
  }, [startSignal, steps.length]);

  // Measure the current target and (re)compute the tooltip position.
  //
  // The spotlight and tooltip are stored in DOCUMENT coordinates (viewport rect
  // + scroll offset) and rendered `position: absolute` at the document origin,
  // NOT `fixed`. This is what makes the highlight stick to its target during a
  // scroll: any JS re-measure is inherently one frame behind the compositor, so
  // a `fixed` box chasing viewport coordinates visibly trails the element by
  // 10–25px during a flick. In document coordinates the boxes scroll *with* the
  // page natively — pure scrolling changes nothing here (rect.top falls as
  // scrollY rises, their sum is constant), so a scroll re-renders zero times
  // and the spotlight cannot lag. The re-measure loop only fires state updates
  // on real layout changes (resize, fonts, data arriving).
  const measure = useCallback(() => {
    if (!step) return;
    const el = findTarget(step.target);
    if (!el) {
      // Target not on the page — skip this step rather than stranding the user.
      const next = nextStepIndex(index, steps.length);
      if (next === null) finish(true);
      else setIndex(next);
      return;
    }
    const r = el.getBoundingClientRect();
    const { scrollX, scrollY } = window;
    const next: Rect = {
      top: r.top + scrollY,
      left: r.left + scrollX,
      width: r.width,
      height: r.height,
    };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const width = tooltipWidthFor(viewport.width);
    // Measure the card itself once it exists — a fixed guess mis-places the
    // tooltip (and the flip decision) whenever the copy wraps to a different
    // number of lines, which it always does on a phone.
    const height = tipRef.current?.offsetHeight || TOOLTIP_FALLBACK_HEIGHT;

    setRect((prev) => (rectsEqual(prev, next) ? prev : next));
    setTipWidth((prev) => (prev === width ? prev : width));
    // Placement/flip/clamp decisions happen in viewport space (that's where
    // "room below" means something), then the result is anchored to the page.
    const vpPos = computeTooltipPosition(
      { top: r.top, left: r.left, width: r.width, height: r.height },
      { width, height },
      viewport,
      step.placement ?? "bottom",
    );
    const nextPos = {
      ...vpPos,
      top: vpPos.top + scrollY,
      left: vpPos.left + scrollX,
    };
    setPos((prev) => (positionsEqual(prev, nextPos) ? prev : nextPos));
  }, [step, index, steps.length, finish]);

  useLayoutEffect(() => {
    if (!active || !step) return;
    // Bring the target into view, then keep re-measuring for as long as the
    // step is on screen — a rAF loop rather than scroll/resize listeners,
    // because iOS coalesces scroll events during momentum scrolling and fires
    // none at all mid-smooth-scroll. Scrolling itself needs no update (the
    // boxes live in document coordinates); the loop exists to catch layout
    // changes under the tour: fonts loading, query data arriving, rotation,
    // the address bar collapsing. `measure` no-ops on unchanged geometry, so a
    // quiet page re-renders zero times.
    findTarget(step.target)?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    let raf = requestAnimationFrame(function tick() {
      measure();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [active, step, measure]);

  const goNext = useCallback(() => {
    const next = nextStepIndex(index, steps.length);
    if (next === null) finish(true);
    else setIndex(next);
  }, [index, steps.length, finish]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Keyboard controls.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
      else if (e.key === "ArrowRight" || e.key === "Enter") goNext();
      else if (e.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goNext, goBack, finish]);

  if (typeof document === "undefined") return null;
  if (!active || !step || !pos || !rect) return null;

  const isLast = index === steps.length - 1;
  const pad = 6;
  const isVertical = pos.placement === "top" || pos.placement === "bottom";

  const overlay = (
    // An anchor at the document origin: the spotlight and tooltip are
    // positioned inside it in document coordinates, so they scroll in perfect
    // sync with the content they annotate (see `measure` for why not `fixed`).
    <div className="absolute inset-0 z-[100]" role="dialog" aria-modal="true">
      {/* Click-catcher so the rest of the page isn't interactable mid-tour.
          Rendered first so the spotlight and tooltip paint above it. This one
          IS fixed — it must cover the screen, not track any content. */}
      <button
        type="button"
        aria-label="Skip tour"
        onClick={() => finish(false)}
        className="fixed inset-0 h-full w-full cursor-default bg-transparent"
      />

      {/* Dim + spotlight: a transparent hole over the target via a huge
          box-shadow. The 9999px shadow far exceeds any viewport, so it keeps
          the whole screen dimmed wherever the box scrolls to. */}
      <div
        data-testid="tour-spotlight"
        className="pointer-events-none absolute rounded-lg ring-2 ring-violet-400"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)",
        }}
      />

      {/* Tooltip card */}
      {/* biome-ignore lint/a11y/useSemanticElements: an ephemeral tour tooltip has no matching semantic element; role="group" with an aria-label is the correct affordance */}
      <div
        ref={tipRef}
        role="group"
        aria-label={`Tour step ${index + 1} of ${steps.length}`}
        className="absolute rounded-xl border border-slate-700 bg-slate-900 p-5 text-left shadow-2xl"
        style={{ top: pos.top, left: pos.left, width: tipWidth }}
      >
        {/* Arrow pointing back at the spotlighted element. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-3 w-3 rotate-45 border border-slate-700 bg-slate-900"
          style={
            isVertical
              ? {
                  left: pos.arrow - 6,
                  ...(pos.placement === "bottom"
                    ? { top: -7, borderRightWidth: 0, borderBottomWidth: 0 }
                    : { bottom: -7, borderLeftWidth: 0, borderTopWidth: 0 }),
                }
              : {
                  top: pos.arrow - 6,
                  ...(pos.placement === "right"
                    ? { left: -7, borderRightWidth: 0, borderTopWidth: 0 }
                    : { right: -7, borderLeftWidth: 0, borderBottomWidth: 0 }),
                }
          }
        />
        <p className="text-xs font-medium uppercase tracking-widest text-violet-400">
          Step {index + 1} of {steps.length}
        </p>
        <h3 className="mt-1 text-base font-semibold text-white">
          {step.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => finish(false)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
