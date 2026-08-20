import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  tourStorageKey,
  isTourCompleted,
  markTourCompleted,
  clearTourCompletion,
  computeTooltipPosition,
  isAnyTourRunning,
  markTourRunning,
  nextStepIndex,
  positionsEqual,
  rectsEqual,
  subscribeTourRunning,
  TOOLTIP_MAX_WIDTH,
  tooltipWidthFor,
} from "./tour";

describe("tour completion storage", () => {
  beforeEach(() => localStorage.clear());

  it("keys storage under a stable namespace", () => {
    expect(tourStorageKey("admin-v1")).toBe("gwinn.tour.admin-v1");
  });

  it("is not completed until marked", () => {
    expect(isTourCompleted("admin-v1")).toBe(false);
    markTourCompleted("admin-v1");
    expect(isTourCompleted("admin-v1")).toBe(true);
  });

  it("clears completion so the tour can replay", () => {
    markTourCompleted("admin-v1");
    clearTourCompletion("admin-v1");
    expect(isTourCompleted("admin-v1")).toBe(false);
  });

  it("scopes completion per tour id", () => {
    markTourCompleted("admin-v1");
    expect(isTourCompleted("storefront-v1")).toBe(false);
  });
});

/**
 * UI that hides a tour anchor behind a disclosure has to unfold while a tour
 * runs, or the step would find no target. Two tours can be mounted at once
 * (the dashboard tour and the checklist's "Show me"), so this counts rather
 * than toggles — the first one finishing must not fold the menu away under the
 * second.
 */
describe("tour running registry", () => {
  it("is idle until a tour marks itself running", () => {
    expect(isAnyTourRunning()).toBe(false);
    const stop = markTourRunning();
    expect(isAnyTourRunning()).toBe(true);
    stop();
    expect(isAnyTourRunning()).toBe(false);
  });

  it("stays running until the last of several tours stops", () => {
    const stopA = markTourRunning();
    const stopB = markTourRunning();
    stopA();
    expect(isAnyTourRunning()).toBe(true);
    stopB();
    expect(isAnyTourRunning()).toBe(false);
  });

  it("ignores a repeated stop rather than under-counting", () => {
    const stopA = markTourRunning();
    const stopB = markTourRunning();
    stopA();
    stopA();
    expect(isAnyTourRunning()).toBe(true);
    stopB();
    expect(isAnyTourRunning()).toBe(false);
  });

  it("notifies subscribers on start and stop, and not after unsubscribing", () => {
    const seen = vi.fn();
    const unsubscribe = subscribeTourRunning(seen);
    const stop = markTourRunning();
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
    expect(seen).toHaveBeenCalledTimes(2);
    unsubscribe();
    markTourRunning()();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("nextStepIndex", () => {
  it("advances until the last step, then returns null", () => {
    expect(nextStepIndex(0, 3)).toBe(1);
    expect(nextStepIndex(1, 3)).toBe(2);
    expect(nextStepIndex(2, 3)).toBeNull();
  });
});

describe("computeTooltipPosition", () => {
  const viewport = { width: 1000, height: 800 };
  const tip = { width: 320, height: 168 };
  const target = { top: 300, left: 400, width: 120, height: 40 };

  it("places a bottom tooltip below the target, centered", () => {
    const p = computeTooltipPosition(target, tip, viewport, "bottom");
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(target.top + target.height + 12);
    // Centered on the target's horizontal midpoint.
    expect(p.left).toBeCloseTo(400 + 60 - 160, 0);
  });

  it("flips bottom→top when there isn't room below", () => {
    const low = { top: 760, left: 400, width: 120, height: 30 };
    const p = computeTooltipPosition(low, tip, viewport, "bottom");
    expect(p.placement).toBe("top");
    expect(p.top).toBeLessThan(low.top);
  });

  it("flips right→left when there isn't room to the right", () => {
    const nearRight = { top: 300, left: 900, width: 80, height: 40 };
    const p = computeTooltipPosition(nearRight, tip, viewport, "right");
    expect(p.placement).toBe("left");
  });

  it("clamps the tooltip inside the viewport", () => {
    const edge = { top: 10, left: 0, width: 40, height: 20 };
    const p = computeTooltipPosition(edge, tip, viewport, "bottom");
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.left + tip.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it("keeps the arrow within the tooltip bounds", () => {
    const p = computeTooltipPosition(target, tip, viewport, "bottom");
    expect(p.arrow).toBeGreaterThanOrEqual(12);
    expect(p.arrow).toBeLessThanOrEqual(tip.width - 12);
  });
});

describe("tooltipWidthFor", () => {
  it("uses the design width on a roomy viewport", () => {
    expect(tooltipWidthFor(1024)).toBe(TOOLTIP_MAX_WIDTH);
  });

  it("shrinks to fit a narrow phone, leaving the margin on both sides", () => {
    expect(tooltipWidthFor(320)).toBe(304);
    expect(tooltipWidthFor(360)).toBe(TOOLTIP_MAX_WIDTH);
  });

  it("never collapses below a readable minimum", () => {
    expect(tooltipWidthFor(120)).toBe(200);
  });
});

describe("geometry equality helpers", () => {
  const rect = { top: 1, left: 2, width: 3, height: 4 };

  it("treats identical rects as equal and any difference as not", () => {
    expect(rectsEqual(rect, { ...rect })).toBe(true);
    expect(rectsEqual(rect, { ...rect, top: 9 })).toBe(false);
    expect(rectsEqual(null, null)).toBe(true);
    expect(rectsEqual(rect, null)).toBe(false);
  });

  it("compares tooltip positions including placement and arrow", () => {
    const pos = { top: 10, left: 20, placement: "bottom" as const, arrow: 30 };
    expect(positionsEqual(pos, { ...pos })).toBe(true);
    expect(positionsEqual(pos, { ...pos, arrow: 31 })).toBe(false);
    expect(positionsEqual(pos, { ...pos, placement: "top" })).toBe(false);
    expect(positionsEqual(null, pos)).toBe(false);
  });
});
