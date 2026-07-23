import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistFn } from "./usePersistFn";

describe("usePersistFn", () => {
  it("returns a stable function reference across re-renders", () => {
    const { result, rerender } = renderHook(({ fn }) => usePersistFn(fn), {
      initialProps: { fn: () => 1 },
    });

    const first = result.current;
    rerender({ fn: () => 2 });
    expect(result.current).toBe(first);
  });

  it("always calls through to the latest function", () => {
    const a = vi.fn(() => "a");
    const b = vi.fn(() => "b");
    const { result, rerender } = renderHook(({ fn }) => usePersistFn(fn), {
      initialProps: { fn: a },
    });

    expect(result.current()).toBe("a");
    rerender({ fn: b });
    expect(result.current()).toBe("b");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("forwards arguments and preserves `this`", () => {
    const { result } = renderHook(() =>
      usePersistFn(function (this: { v: number }, x: number) {
        return this.v + x;
      }),
    );

    const ctx = { v: 10, run: result.current };
    let out = 0;
    act(() => {
      out = ctx.run(5);
    });
    expect(out).toBe(15);
  });
});
