import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTourActive } from "./useTourActive";
import { markTourRunning } from "@/lib/tour";

describe("useTourActive", () => {
  it("is false while no tour is running", () => {
    const { result } = renderHook(() => useTourActive());
    expect(result.current).toBe(false);
  });

  it("tracks a tour starting and stopping", () => {
    const { result } = renderHook(() => useTourActive());
    let stop = () => {};
    act(() => {
      stop = markTourRunning();
    });
    expect(result.current).toBe(true);
    act(() => stop());
    expect(result.current).toBe(false);
  });

  it("stays true until the last of two overlapping tours stops", () => {
    const { result } = renderHook(() => useTourActive());
    let stopA = () => {};
    let stopB = () => {};
    act(() => {
      stopA = markTourRunning();
      stopB = markTourRunning();
    });
    act(() => stopA());
    expect(result.current).toBe(true);
    act(() => stopB());
    expect(result.current).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const { result, unmount } = renderHook(() => useTourActive());
    unmount();
    // No listener left to update: starting a tour must not throw or resurrect
    // the unmounted hook's value.
    const stop = markTourRunning();
    expect(result.current).toBe(false);
    stop();
  });
});
