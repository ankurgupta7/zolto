import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";
import {
  ReelChapter,
  ReelPanel,
  ReelStage,
  REEL_LAYOUT_QUERY,
} from "./ReelStage";

/**
 * The reel's contract. Panels — not chapters — are what snapping aligns to, the
 * scroller is the document, and the snap strength is measured rather than
 * assumed: a target taller than the screen downgrades the whole scroller to
 * proximity, because a mandatory target you can't reach the bottom of is a trap.
 */

interface FakeEntry {
  target: Element;
  isIntersecting: boolean;
  intersectionRatio: number;
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly targets: Element[] = [];
  constructor(
    readonly callback: (entries: FakeEntry[]) => void,
    readonly options: IntersectionObserverInit,
  ) {
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function liveObserver() {
  const observer = MockIntersectionObserver.instances.at(-1);
  if (!observer) throw new Error("no IntersectionObserver was created");
  return observer;
}

/** Report panel visibility the way the browser would, by chapter id. */
function report(entries: Array<[string, number]>) {
  const observer = liveObserver();
  act(() => {
    observer.callback(
      entries.map(([chapterId, ratio]) => ({
        target: document.querySelector(`[data-reel-panel="${chapterId}"]`)!,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      })),
    );
  });
}

function mockMatchMedia({ wide = true, reduce = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : wide,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Pin the viewport and the height of every snap target of a kind. */
function setHeights(selector: string, height: number) {
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  )) {
    Object.defineProperty(el, "offsetHeight", {
      value: height,
      configurable: true,
    });
  }
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  MockIntersectionObserver.instances.length = 0;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  window.innerHeight = 900;
  mockMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  delete document.documentElement.dataset.reel;
});

function renderReel() {
  return render(
    <ReelStage label="Chapters">
      <ReelChapter id="promise" label="Promise">
        <ReelPanel>
          <h2>A whole shop in your pocket</h2>
        </ReelPanel>
        <ReelPanel>
          <p>the explainer</p>
        </ReelPanel>
      </ReelChapter>
      <ReelChapter id="squeeze" label="The squeeze">
        <ReelPanel>
          <h2>Your catalogue and TWINT</h2>
        </ReelPanel>
      </ReelChapter>
      <ReelChapter id="trust" label="Trust">
        <ReelPanel>
          <h2>Made in Switzerland</h2>
        </ReelPanel>
      </ReelChapter>
    </ReelStage>,
  );
}

describe("ReelStage — structure", () => {
  it("renders every panel's content, in order, inside named chapter sections", () => {
    renderReel();
    // Nothing is lazy-mounted or hidden behind an interaction: a crawler that
    // never scrolls still sees the last chapter.
    expect(screen.getByText("A whole shop in your pocket")).toBeTruthy();
    expect(screen.getByText("the explainer")).toBeTruthy();
    expect(screen.getByText("Made in Switzerland")).toBeTruthy();

    const sections = Array.from(document.querySelectorAll("section"));
    expect(sections.map((s) => s.getAttribute("data-reel-chapter"))).toEqual([
      "promise",
      "squeeze",
      "trust",
    ]);
    // Named sections, so each chapter is a region landmark rather than an
    // anonymous <section> a screen reader skips.
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Promise",
      "The squeeze",
      "Trust",
    ]);
    // The id doubles as the fragment target (/#product).
    expect(sections.map((s) => s.id)).toEqual(["promise", "squeeze", "trust"]);
  });

  it("makes each panel a snap target sized in svh, and each chapter one only when wide", () => {
    renderReel();
    const panels = Array.from(document.querySelectorAll("[data-reel-panel]"));
    expect(panels.length).toBe(4);
    for (const panel of panels) {
      expect(panel.className).toContain("snap-start");
      // svh, not dvh: dvh changes as a mobile address bar collapses, which
      // would resize the panel mid-swipe.
      expect(panel.className).toContain(
        "min-h-[calc(100svh_-_var(--nav-height))]",
      );
      // …and steps aside once the chapter itself is the screen.
      expect(panel.className).toContain("reel:snap-align-none");
      expect(panel.className).toContain("reel:min-h-0");
    }
    for (const section of Array.from(document.querySelectorAll("section"))) {
      expect(section.className).toContain("reel:snap-start");
      expect(section.className).toContain(
        "reel:min-h-[calc(100svh_-_var(--nav-height))]",
      );
      // `grid`, never `flex`: index.css's unlayered `.flex { min-height: 0 }`
      // beats every utility and silently collapsed the first version of this.
      expect(section.className).toContain("grid");
      expect(section.className).not.toMatch(/(^|\s)flex(\s|$)/);
    }
  });

  it("keeps the layout breakpoint identical in CSS and in the measuring code", () => {
    // CSS decides whether a chapter is one screen; the measuring code only asks
    // which way it went. Two copies of that query that drift would measure the
    // wrong targets and pick the wrong snap strength.
    const css = readFileSync(
      path.resolve(__dirname, "..", "..", "index.css"),
      "utf8",
    );
    expect(css).toContain(REEL_LAYOUT_QUERY);
  });
});

describe("ReelStage — the rail", () => {
  it("derives one dot per chapter from the chapters that rendered", () => {
    renderReel();
    const rail = screen.getByRole("navigation", { name: "Chapters" });
    const dots = Array.from(rail.querySelectorAll("button"));
    expect(dots.length).toBe(3);
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Promise",
      "The squeeze",
      "Trust",
    ]);
  });

  it("scrolls the window — not scrollIntoView — when a dot is clicked", () => {
    renderReel();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    fireEvent.click(screen.getByRole("button", { name: "Trust" }));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    const [arg] = (scrollTo as unknown as Mock).mock.calls[0];
    expect(arg.behavior).toBe("smooth");
    expect(typeof arg.top).toBe("number");
  });

  it("tracks the active chapter from its panels, at a 0.55 threshold", () => {
    renderReel();
    expect(liveObserver().options.threshold).toBe(0.55);
    // The viewport is the observation root now that the document scrolls.
    expect(liveObserver().options.root).toBeUndefined();

    report([
      ["promise", 1],
      ["trust", 0],
    ]);
    const dot = (name: string) => screen.getByRole("button", { name });
    expect(dot("Promise").getAttribute("aria-current")).toBe("true");
    expect(dot("Trust").getAttribute("aria-current")).toBeNull();

    report([
      ["promise", 0],
      ["trust", 0.9],
    ]);
    expect(dot("Trust").getAttribute("aria-current")).toBe("true");
    expect(dot("Promise").getAttribute("aria-current")).toBeNull();
  });

  it("lights the first chapter when there is no IntersectionObserver at all", () => {
    vi.unstubAllGlobals();
    // biome-ignore lint/suspicious/noExplicitAny: removing a global for the test
    (window as any).IntersectionObserver = undefined;
    renderReel();
    expect(
      screen
        .getByRole("button", { name: "Promise" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });
});

describe("ReelStage — snap strength", () => {
  /** Re-measure the way a resize would. */
  function remeasure() {
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  it("snaps hard when every target fits the screen", () => {
    renderReel();
    setHeights("section", 800);
    setHeights("[data-reel-panel]", 800);
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("mandatory");
    expect(screen.getByTestId("reel-stage").dataset.reelSnap).toBe("mandatory");
  });

  it("falls back to proximity when a target is taller than the screen", () => {
    // Mandatory snapping on a target that doesn't fit means its bottom can
    // never be read — the scroller keeps pulling back to the top. Proximity
    // still catches at the top of each one.
    renderReel();
    setHeights("section", 1400);
    setHeights("[data-reel-panel]", 1400);
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("proximity");
  });

  it("measures panels below the layout breakpoint and chapters above it", () => {
    // The two are different heights: a chapter that fits as three columns does
    // not fit as three stacked panels, which is exactly the case that made the
    // first version of this reel stop snapping on phones and small laptops.
    mockMatchMedia({ wide: false });
    renderReel();
    setHeights("section", 2400); // tall, but not a snap target at this size
    setHeights("[data-reel-panel]", 700);
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("mandatory");

    mockMatchMedia({ wide: true });
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("proximity");
  });

  it("switches snapping off entirely under prefers-reduced-motion", () => {
    mockMatchMedia({ wide: true, reduce: true });
    renderReel();
    setHeights("section", 800);
    setHeights("[data-reel-panel]", 800);
    remeasure();
    expect(document.documentElement.dataset.reel).toBeUndefined();
  });

  it("takes the declaration off <html> when the reel unmounts", () => {
    // Every other page shares that element — a stale snap-type would make the
    // whole site snap.
    const { unmount } = renderReel();
    setHeights("section", 800);
    setHeights("[data-reel-panel]", 800);
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("mandatory");
    unmount();
    expect(document.documentElement.dataset.reel).toBeUndefined();
  });
});

describe("ReelStage — keyboard", () => {
  it("intercepts no keyboard events", () => {
    // PageUp/PageDown/Home/End/arrows have to keep working; nothing here may
    // preventDefault them.
    renderReel();
    for (const key of ["PageDown", "PageUp", "Home", "End", "ArrowDown"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      screen.getByTestId("reel-stage").dispatchEvent(event);
      expect(event.defaultPrevented, key).toBe(false);
    }
  });
});
