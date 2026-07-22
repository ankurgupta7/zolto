import { describe, it, expect, beforeEach } from "vitest";
import {
  tourStorageKey,
  isTourCompleted,
  markTourCompleted,
  clearTourCompletion,
  computeTooltipPosition,
  nextStepIndex,
} from "./tour";

describe("tour completion storage", () => {
  beforeEach(() => localStorage.clear());

  it("keys storage under a stable namespace", () => {
    expect(tourStorageKey("admin-v1")).toBe("zolto.tour.admin-v1");
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
