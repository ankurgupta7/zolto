import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  computeTooltipPosition,
  isTourCompleted,
  markTourCompleted,
  nextStepIndex,
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

const TIP = { width: 320, height: 168 };

/**
 * A lightweight coach-mark / product-tour overlay: dims the page, spotlights one
 * target element at a time, and shows an arrow + tooltip with Back / Next / Skip.
 * Purely presentational logic lives in `@/lib/tour` (tested there).
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
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<TooltipPosition | null>(null);
  const rafRef = useRef<number | null>(null);

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
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      // Target not on the page — skip this step rather than stranding the user.
      const next = nextStepIndex(index, steps.length);
      if (next === null) finish(true);
      else setIndex(next);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect(r);
    setPos(
      computeTooltipPosition(
        { top: r.top, left: r.left, width: r.width, height: r.height },
        TIP,
        { width: window.innerWidth, height: window.innerHeight },
        step.placement ?? "bottom",
      ),
    );
  }, [step, index, steps.length, finish]);

  useLayoutEffect(() => {
    if (!active || !step) return;
    // Bring the target into view, then measure on the next frame.
    document.querySelector(step.target)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    rafRef.current = requestAnimationFrame(measure);
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
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

  if (!active || !step || !pos || !rect) return null;

  const isLast = index === steps.length - 1;
  const pad = 6;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      {/* Dim + spotlight: a transparent hole over the target via a huge box-shadow. */}
      <div
        className="pointer-events-none absolute rounded-lg ring-2 ring-violet-400 transition-all duration-200"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)",
        }}
      />

      {/* Click-catcher so the rest of the page isn't interactable mid-tour. */}
      <button
        type="button"
        aria-label="Skip tour"
        onClick={() => finish(false)}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />

      {/* Tooltip card */}
      {/* biome-ignore lint/a11y/useSemanticElements: an ephemeral tour tooltip has no matching semantic element; role="group" with an aria-label is the correct affordance */}
      <div
        role="group"
        aria-label={`Tour step ${index + 1} of ${steps.length}`}
        className="absolute w-[320px] rounded-xl border border-slate-700 bg-slate-900 p-5 text-left shadow-2xl"
        style={{ top: pos.top, left: pos.left, minHeight: TIP.height }}
      >
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
}
