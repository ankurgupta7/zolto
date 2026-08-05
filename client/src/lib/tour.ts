/**
 * Pure helpers for the first-time-user guided tour (coach marks). Kept free of
 * React/DOM side effects so the storage + positioning logic can be unit-tested.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** CSS selector for the element to spotlight, e.g. `[data-tour="add-product"]`. */
  target: string;
  /**
   * i18next keys (admin namespace) for the step's heading and paragraph, NOT
   * the copy itself — the step lists are module constants evaluated once at
   * import time, so a literal would freeze the tour in whatever language the
   * bundle was authored in. GuidedTour resolves them with `t()` at render, so
   * a language switch mid-tour re-renders into the new language.
   */
  titleKey: string;
  bodyKey: string;
  /** Preferred side to place the tooltip; may be flipped to stay on-screen. */
  placement?: TourPlacement;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface TooltipPosition {
  top: number;
  left: number;
  placement: TourPlacement;
  /** Arrow offset (px) along the tooltip edge facing the target. */
  arrow: number;
}

const STORAGE_PREFIX = "zolto.tour.";

export function tourStorageKey(tourId: string): string {
  return `${STORAGE_PREFIX}${tourId}`;
}

/** Whether the user has already completed (or dismissed) this tour. */
export function isTourCompleted(tourId: string): boolean {
  try {
    return localStorage.getItem(tourStorageKey(tourId)) === "done";
  } catch {
    // localStorage can throw in private mode / SSR — fail open (don't nag).
    return true;
  }
}

export function markTourCompleted(tourId: string): void {
  try {
    localStorage.setItem(tourStorageKey(tourId), "done");
  } catch {
    /* ignore */
  }
}

/** Clear completion so the tour can be re-run (e.g. a "Replay tour" button). */
export function clearTourCompletion(tourId: string): void {
  try {
    localStorage.removeItem(tourStorageKey(tourId));
  } catch {
    /* ignore */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Widest the tooltip card is ever allowed to be (px). */
export const TOOLTIP_MAX_WIDTH = 320;
/** Used for the very first placement pass, before the card has been measured. */
export const TOOLTIP_FALLBACK_HEIGHT = 168;

/**
 * Tooltip width for a given viewport: the design width on anything roomy, but
 * shrunk to fit narrow phones so the card never overflows the screen edge.
 */
export function tooltipWidthFor(viewportWidth: number, margin = 8): number {
  return Math.max(200, Math.min(TOOLTIP_MAX_WIDTH, viewportWidth - margin * 2));
}

/** True when two rects describe the same box — used to skip no-op re-renders. */
export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** True when two computed tooltip positions are identical. */
export function positionsEqual(
  a: TooltipPosition | null,
  b: TooltipPosition | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.placement === b.placement &&
    a.arrow === b.arrow
  );
}

/**
 * Compute where to place a tooltip of size `tip` relative to a `target` rect,
 * preferring `placement` but flipping to the opposite side when there isn't room,
 * and clamping into the viewport. All coordinates are viewport-relative (px), to
 * be used with `position: fixed`.
 */
export function computeTooltipPosition(
  target: Rect,
  tip: { width: number; height: number },
  viewport: Viewport,
  placement: TourPlacement = "bottom",
  gap = 12,
  margin = 8,
): TooltipPosition {
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  const roomAbove = target.top;
  const roomBelow = viewport.height - (target.top + target.height);
  const roomLeft = target.left;
  const roomRight = viewport.width - (target.left + target.width);

  // Flip vertical/horizontal placement if the preferred side lacks room.
  let placed: TourPlacement = placement;
  if (
    placement === "bottom" &&
    roomBelow < tip.height + gap &&
    roomAbove > roomBelow
  ) {
    placed = "top";
  } else if (
    placement === "top" &&
    roomAbove < tip.height + gap &&
    roomBelow > roomAbove
  ) {
    placed = "bottom";
  } else if (
    placement === "right" &&
    roomRight < tip.width + gap &&
    roomLeft > roomRight
  ) {
    placed = "left";
  } else if (
    placement === "left" &&
    roomLeft < tip.width + gap &&
    roomRight > roomLeft
  ) {
    placed = "right";
  }

  let top: number;
  let left: number;

  if (placed === "top" || placed === "bottom") {
    top =
      placed === "bottom"
        ? target.top + target.height + gap
        : target.top - tip.height - gap;
    left = targetCenterX - tip.width / 2;
    left = clamp(
      left,
      margin,
      Math.max(margin, viewport.width - tip.width - margin),
    );
    top = clamp(
      top,
      margin,
      Math.max(margin, viewport.height - tip.height - margin),
    );
    // Arrow points at the target's horizontal center, relative to the tooltip.
    const arrow = clamp(targetCenterX - left, 12, tip.width - 12);
    return { top, left, placement: placed, arrow };
  }

  left =
    placed === "right"
      ? target.left + target.width + gap
      : target.left - tip.width - gap;
  top = targetCenterY - tip.height / 2;
  left = clamp(
    left,
    margin,
    Math.max(margin, viewport.width - tip.width - margin),
  );
  top = clamp(
    top,
    margin,
    Math.max(margin, viewport.height - tip.height - margin),
  );
  const arrow = clamp(targetCenterY - top, 12, tip.height - 12);
  return { top, left, placement: placed, arrow };
}

/**
 * Given the current step index and the number of steps, resolve the next index
 * or `null` when the tour is finished.
 */
export function nextStepIndex(current: number, total: number): number | null {
  return current + 1 < total ? current + 1 : null;
}
