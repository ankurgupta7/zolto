import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useComposition } from "./useComposition";

function makeKeyEvent(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    stopPropagation: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

describe("useComposition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks composition state across start and end", () => {
    const { result } = renderHook(() => useComposition());

    expect(result.current.isComposing()).toBe(false);

    result.current.onCompositionStart(
      {} as React.CompositionEvent<HTMLInputElement>,
    );
    expect(result.current.isComposing()).toBe(true);

    result.current.onCompositionEnd(
      {} as React.CompositionEvent<HTMLInputElement>,
    );
    // Two nested timers must flush before composition clears.
    vi.runAllTimers();
    expect(result.current.isComposing()).toBe(false);
  });

  it("stops Enter and Escape from propagating while composing", () => {
    const originalOnKeyDown = vi.fn();
    const { result } = renderHook(() =>
      useComposition<HTMLInputElement>({ onKeyDown: originalOnKeyDown }),
    );

    result.current.onCompositionStart(
      {} as React.CompositionEvent<HTMLInputElement>,
    );

    const enter = makeKeyEvent("Enter");
    result.current.onKeyDown(enter);
    expect(enter.stopPropagation).toHaveBeenCalled();
    expect(originalOnKeyDown).not.toHaveBeenCalled();

    const esc = makeKeyEvent("Escape");
    result.current.onKeyDown(esc);
    expect(esc.stopPropagation).toHaveBeenCalled();
  });

  it("lets shift+Enter through even while composing", () => {
    const originalOnKeyDown = vi.fn();
    const { result } = renderHook(() =>
      useComposition<HTMLInputElement>({ onKeyDown: originalOnKeyDown }),
    );
    result.current.onCompositionStart(
      {} as React.CompositionEvent<HTMLInputElement>,
    );

    const shiftEnter = makeKeyEvent("Enter", true);
    result.current.onKeyDown(shiftEnter);
    expect(shiftEnter.stopPropagation).not.toHaveBeenCalled();
    expect(originalOnKeyDown).toHaveBeenCalledWith(shiftEnter);
  });

  it("forwards key events to the original handler when not composing", () => {
    const originalOnKeyDown = vi.fn();
    const { result } = renderHook(() =>
      useComposition<HTMLInputElement>({ onKeyDown: originalOnKeyDown }),
    );

    const enter = makeKeyEvent("Enter");
    result.current.onKeyDown(enter);
    expect(enter.stopPropagation).not.toHaveBeenCalled();
    expect(originalOnKeyDown).toHaveBeenCalledWith(enter);
  });

  it("invokes the caller's composition callbacks", () => {
    const onCompositionStart = vi.fn();
    const onCompositionEnd = vi.fn();
    const { result } = renderHook(() =>
      useComposition<HTMLInputElement>({
        onCompositionStart,
        onCompositionEnd,
      }),
    );

    const startEvt = {} as React.CompositionEvent<HTMLInputElement>;
    const endEvt = {} as React.CompositionEvent<HTMLInputElement>;
    result.current.onCompositionStart(startEvt);
    result.current.onCompositionEnd(endEvt);
    expect(onCompositionStart).toHaveBeenCalledWith(startEvt);
    expect(onCompositionEnd).toHaveBeenCalledWith(endEvt);
  });

  it("clears any pending end-timers when a new composition starts", () => {
    const { result } = renderHook(() => useComposition());

    result.current.onCompositionStart(
      {} as React.CompositionEvent<HTMLInputElement>,
    );
    result.current.onCompositionEnd(
      {} as React.CompositionEvent<HTMLInputElement>,
    );
    // Start again before timers flush — should cancel the pending clear.
    result.current.onCompositionStart(
      {} as React.CompositionEvent<HTMLInputElement>,
    );
    vi.runAllTimers();
    expect(result.current.isComposing()).toBe(true);
  });
});
