import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ParticleField from "./ParticleField";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A minimal 2D-context stub recording the calls ParticleField makes. */
function makeCtxStub() {
  const gradient = { addColorStop: vi.fn() };
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
  };
}

function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("ParticleField", () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  it("renders a decorative, non-interactive fixed overlay", () => {
    const { container } = render(<ParticleField />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
    expect(canvas!.getAttribute("aria-hidden")).toBe("true");
    // must never eat clicks, and must span the viewport behind the chrome
    expect(canvas!.className).toContain("pointer-events-none");
    expect(canvas!.className).toContain("fixed");
    expect(canvas!.className).toContain("mix-blend-screen");
  });

  it("degrades gracefully when the 2D context is unavailable (jsdom default)", () => {
    // getContext returns null here; the component must not throw.
    expect(() => render(<ParticleField />)).not.toThrow();
  });

  it("seeds and animates particles when a context is available", () => {
    const ctx = makeCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    // Drive exactly one animation frame, then stop scheduling to avoid a loop.
    let frames = 0;
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        if (frames++ === 0) cb(0);
        return frames;
      });

    render(<ParticleField density={5000} />);

    // The viewport was sized once and a frame's paint drew at least one particle.
    expect(rafSpy).toHaveBeenCalled();
    expect(ctx.setTransform).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.createRadialGradient).toHaveBeenCalled();
  });

  it("respects prefers-reduced-motion: paints once, never schedules a frame", () => {
    stubMatchMedia(true);
    const ctx = makeCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 1);

    render(<ParticleField />);

    expect(ctx.arc).toHaveBeenCalled(); // static frame drawn
    expect(rafSpy).not.toHaveBeenCalled(); // but no animation loop
  });

  it("cancels the animation frame on unmount", () => {
    const ctx = makeCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 42);
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");

    const { unmount } = render(<ParticleField />);
    unmount();

    expect(cancelSpy).toHaveBeenCalledWith(42);
  });
});
