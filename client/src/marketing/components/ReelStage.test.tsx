import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";
import { ReelChapter, ReelStage } from "./ReelStage";

/**
 * The reel's contract, in the order the reader meets it: everything is in the
 * DOM, the rail is derived from what rendered, the dots scroll the stage, the
 * active dot follows the observer — and the whole treatment stands down when
 * the visitor has asked for less motion or is on a phone.
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

/** The live observer is the one created after the chapters registered. */
function liveObserver() {
  const observer = MockIntersectionObserver.instances.at(-1);
  if (!observer) throw new Error("no IntersectionObserver was created");
  return observer;
}

function report(entries: Array<[string, number]>) {
  const observer = liveObserver();
  act(() => {
    observer.callback(
      entries.map(([id, ratio]) => ({
        target: document.querySelector(`[data-reel-chapter="${id}"]`)!,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      })),
    );
  });
}

function mockMatchMedia({ desktop = true, reduce = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : desktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  MockIntersectionObserver.instances.length = 0;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  mockMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
});

function renderReel() {
  return render(
    <ReelStage label="Chapters" trailer={<footer>the footer</footer>}>
      <ReelChapter id="promise" label="Promise">
        <h2>A whole shop in your pocket</h2>
      </ReelChapter>
      <ReelChapter id="squeeze" label="The squeeze">
        <h2>Your catalogue and TWINT</h2>
      </ReelChapter>
      <ReelChapter id="trust" label="Trust">
        <h2>Made in Switzerland</h2>
      </ReelChapter>
    </ReelStage>,
  );
}

function stageEl() {
  return screen.getByTestId("reel-stage");
}

describe("ReelStage", () => {
  it("renders every chapter's content, in order, inside named sections", () => {
    renderReel();
    // Nothing is lazy-mounted or hidden behind an interaction: a crawler that
    // never scrolls still sees chapter six.
    expect(screen.getByText("A whole shop in your pocket")).toBeTruthy();
    expect(screen.getByText("Your catalogue and TWINT")).toBeTruthy();
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

  it("puts the page's main landmark and the footer trailer inside the scroller", () => {
    // The stage carries overscroll-contain, so a footer left outside it could
    // not be reached with a wheel — see the trailer prop.
    renderReel();
    const stage = stageEl();
    expect(stage.querySelector("main")).toBeTruthy();
    expect(stage.textContent).toContain("the footer");
  });

  it("derives the rail from the chapters that actually rendered", () => {
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

  it("scrolls the stage — not scrollIntoView — when a dot is clicked", () => {
    renderReel();
    const stage = stageEl();
    const scrollTo = vi.fn();
    (stage as unknown as { scrollTo: Mock }).scrollTo = scrollTo;

    fireEvent.click(screen.getByRole("button", { name: "Trust" }));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    const [arg] = scrollTo.mock.calls[0];
    expect(arg.behavior).toBe("smooth");
    expect(typeof arg.top).toBe("number");
  });

  it("tracks the active chapter from the observer, at a 0.55 threshold", () => {
    renderReel();
    expect(liveObserver().options.threshold).toBe(0.55);
    // The stage is the observation root, not the viewport: chapters scroll
    // inside it.
    expect(liveObserver().options.root).toBe(stageEl());

    report([
      ["promise", 1],
      ["squeeze", 0],
      ["trust", 0],
    ]);
    const dot = (name: string) => screen.getByRole("button", { name });
    expect(dot("Promise").getAttribute("aria-current")).toBe("true");
    expect(dot("Trust").getAttribute("aria-current")).toBeNull();

    // Scrolling on: the chapter showing most of itself takes the rail with it.
    report([
      ["promise", 0],
      ["trust", 0.9],
    ]);
    expect(dot("Trust").getAttribute("aria-current")).toBe("true");
    expect(dot("Promise").getAttribute("aria-current")).toBeNull();
  });

  it("snaps by default and aligns every chapter to the top", () => {
    renderReel();
    const stage = stageEl();
    expect(stage.className).toContain("snap-y");
    expect(stage.className).toContain("snap-mandatory");
    expect(stage.className).toContain("overscroll-y-contain");
    expect(stage.getAttribute("data-reel-active")).toBe("true");
    for (const section of Array.from(document.querySelectorAll("section"))) {
      expect(section.getAttribute("data-reel-snap")).toBe("start");
      expect(section.className).toContain("snap-start");
    }
  });

  it("centres its chapters with grid, because .flex would zero their min-height", () => {
    // index.css carries an unlayered `.flex { min-height: 0 }`, and unlayered
    // rules beat every utility in @layer utilities. A chapter that centred its
    // content with `flex flex-col justify-center` therefore lost
    // `min-h-[calc(100dvh - …)]` entirely and collapsed to its content height —
    // the reel silently became the long page it replaced. Caught by eye, not by
    // a test, which is why this one exists.
    renderReel();
    const chapter = document.querySelector('[data-reel-chapter="promise"]')!;
    expect(chapter.className).toContain("min-h-[calc(100dvh");
    expect(chapter.className).toContain("grid");
    expect(chapter.className).not.toMatch(/(^|\s)flex(\s|$)/);
  });

  it("drops snapping entirely under prefers-reduced-motion", () => {
    // Mandatory snapping is motion the visitor explicitly asked not to have,
    // and a viewport-locked nested scroller is the same treatment by another
    // name — so the page goes back to being a long page.
    mockMatchMedia({ desktop: true, reduce: true });
    renderReel();
    const stage = stageEl();
    expect(stage.className).not.toContain("snap-y");
    expect(stage.className).not.toContain("snap-mandatory");
    expect(stage.className).not.toContain("scroll-smooth");
    expect(stage.className).not.toContain("100dvh");
    expect(stage.getAttribute("data-reel-active")).toBe("false");
    for (const section of Array.from(document.querySelectorAll("section"))) {
      expect(section.className).not.toContain("snap-start");
    }
  });

  it("drops snapping below 768px, where the reel is not the treatment", () => {
    mockMatchMedia({ desktop: false, reduce: false });
    renderReel();
    expect(stageEl().className).not.toContain("snap-mandatory");
    expect(stageEl().getAttribute("data-reel-active")).toBe("false");
  });

  it("still scrolls to a chapter when the window is the scroller", () => {
    mockMatchMedia({ desktop: false, reduce: false });
    renderReel();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    fireEvent.click(screen.getByRole("button", { name: "The squeeze" }));

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("stops snapping a chapter that is taller than the stage", () => {
    // Mandatory snapping on a chapter that doesn't fit means its bottom can
    // never be read: the scroller keeps pulling back to the top.
    renderReel();
    const stage = stageEl();
    const tall = document.querySelector<HTMLElement>(
      '[data-reel-chapter="squeeze"]',
    )!;
    Object.defineProperty(stage, "clientHeight", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(tall, "offsetHeight", {
      value: 1400,
      configurable: true,
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(tall.getAttribute("data-reel-snap")).toBe("none");
    expect(tall.className).toContain("snap-align-none");
    // Its neighbours, which fit, still snap.
    const fits = document.querySelector('[data-reel-chapter="promise"]')!;
    expect(fits.getAttribute("data-reel-snap")).toBe("start");
  });

  it("lights the first chapter when there is no IntersectionObserver at all", () => {
    // jsdom, old browsers: the reel degrades to a long page, and an unlit rail
    // would read as broken.
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
      stageEl().dispatchEvent(event);
      expect(event.defaultPrevented, key).toBe(false);
    }
  });
});
