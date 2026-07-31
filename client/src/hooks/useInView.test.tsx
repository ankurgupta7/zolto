import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useInView } from "./useInView";

type ObserverEntry = { isIntersecting: boolean };
type ObserverCallback = (entries: ObserverEntry[]) => void;

/**
 * Installs a controllable IntersectionObserver. jsdom ships none, so without
 * this the hook would take its "no observer → always visible" branch and the
 * reveal behaviour would be untestable.
 */
function stubObserver() {
  const callbacks: ObserverCallback[] = [];
  const disconnect = vi.fn();
  const observe = vi.fn();

  class FakeObserver {
    constructor(cb: ObserverCallback) {
      callbacks.push(cb);
    }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = vi.fn();
  }

  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return {
    observe,
    disconnect,
    fire: (isIntersecting: boolean) =>
      act(() => {
        for (const cb of callbacks) cb([{ isIntersecting }]);
      }),
  };
}

/** Minimal consumer that surfaces the hook's state as a DOM attribute. */
function Probe() {
  const { ref, inView } = useInView();
  return <div ref={ref} data-testid="probe" data-in-view={String(inView)} />;
}

const state = () =>
  screen.getByTestId("probe").getAttribute("data-in-view") === "true";

beforeEach(() => {
  // jsdom has no matchMedia; default to "motion is fine" unless a test says otherwise.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useInView", () => {
  it("starts hidden and observes the element", () => {
    const observer = stubObserver();
    render(<Probe />);
    expect(state()).toBe(false);
    expect(observer.observe).toHaveBeenCalled();
  });

  it("reveals once the element intersects", () => {
    const observer = stubObserver();
    render(<Probe />);
    observer.fire(true);
    expect(state()).toBe(true);
  });

  it("stays visible once revealed — it never re-hides on scroll back", () => {
    const observer = stubObserver();
    render(<Probe />);
    observer.fire(true);
    observer.fire(false);
    expect(state()).toBe(true);
  });

  it("stops observing after the first reveal", () => {
    const observer = stubObserver();
    render(<Probe />);
    observer.fire(true);
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("degrades to visible when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe />);
    expect(state()).toBe(true);
  });

  it("skips the animation entirely under prefers-reduced-motion", () => {
    stubObserver();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    );
    render(<Probe />);
    expect(state()).toBe(true);
  });
});
