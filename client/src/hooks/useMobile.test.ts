import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./useMobile";

type ChangeListener = () => void;

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("useIsMobile", () => {
  let listeners: ChangeListener[];
  let addSpy: ReturnType<typeof vi.fn>;
  let removeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = [];
    addSpy = vi.fn((_: string, cb: ChangeListener) => listeners.push(cb));
    removeSpy = vi.fn((_: string, cb: ChangeListener) => {
      listeners = listeners.filter((l) => l !== cb);
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: addSpy,
        removeEventListener: removeSpy,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports mobile when the viewport is below the breakpoint", () => {
    setViewport(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  // Layout that keys off this (the admin header collapsing its tools) would
  // otherwise paint its desktop shape once on a phone before snapping over.
  it("knows the width on the very first render, before any effect runs", () => {
    setViewport(390);
    let firstRender: boolean | undefined;
    renderHook(() => {
      const value = useIsMobile();
      firstRender ??= value;
      return value;
    });
    expect(firstRender).toBe(true);
  });

  it("reports non-mobile at or above the breakpoint", () => {
    setViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("updates when the media query change fires and cleans up on unmount", () => {
    setViewport(1024);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    setViewport(400);
    act(() => {
      for (const l of listeners) l();
    });
    expect(result.current).toBe(true);

    unmount();
    expect(removeSpy).toHaveBeenCalled();
  });
});
