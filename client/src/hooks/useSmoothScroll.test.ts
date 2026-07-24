import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const raf = vi.fn();
const destroy = vi.fn();

vi.mock("lenis", () => ({
  default: class {
    raf = raf;
    destroy = destroy;
    constructor(public opts: unknown) {}
  },
}));

import { useSmoothScroll, lenisRef } from "./useSmoothScroll";

describe("useSmoothScroll", () => {
  beforeEach(() => {
    raf.mockClear();
    destroy.mockClear();
    lenisRef.current = null;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 42),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a Lenis instance and exposes it via lenisRef", () => {
    renderHook(() => useSmoothScroll());
    expect(lenisRef.current).not.toBeNull();
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it("drives Lenis.raf on each animation frame", () => {
    const rafSpy = requestAnimationFrame as unknown as ReturnType<typeof vi.fn>;
    renderHook(() => useSmoothScroll());
    // Invoke the scheduled frame callback manually.
    const cb = rafSpy.mock.calls[0][0] as (t: number) => void;
    cb(123);
    expect(raf).toHaveBeenCalledWith(123);
  });

  it("tears down Lenis and clears the ref on unmount", () => {
    const { unmount } = renderHook(() => useSmoothScroll());
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(destroy).toHaveBeenCalled();
    expect(lenisRef.current).toBeNull();
  });
});
