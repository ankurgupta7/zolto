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
  ReelPanels,
  ReelStage,
  REEL_LAYOUT_QUERY,
} from "./ReelStage";

/**
 * The reel's contract — two axes, and neither of them may trap the reader.
 *
 * Down: a chapter is one post, exactly one screen, and nothing resists the
 * gesture — the snap is proximity and sets no `scroll-snap-stop`, so a swipe
 * goes where its momentum takes it and the page settles onto a post after.
 * Sideways: the panels of a post are a horizontal snap track with dots, with
 * the edge of the next one showing, and `overscroll-x-contain` keeps a swipe at
 * either end from chaining into the browser's back gesture. Above
 * REEL_LAYOUT_QUERY the sideways axis collapses and the panels become columns.
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

/**
 * There are two kinds of observer on the page now — one watching the posts for
 * the rail, one per track watching that post's slides for its dots — and a
 * re-render replaces them, so "the live one" is the last of its kind.
 */
function observerWithThreshold(threshold: number) {
  const observer = MockIntersectionObserver.instances
    .filter((o) => o.options.threshold === threshold)
    .at(-1);
  if (!observer) throw new Error(`no observer at threshold ${threshold}`);
  return observer;
}

/** The stage's observer: which post the rail should light. */
const chapterObserver = () => observerWithThreshold(0.55);
/** A track's observer: which slide its dots should light. */
function slideObserver(trackIndex = 0) {
  const track = document.querySelectorAll('[data-testid="reel-track"]')[
    trackIndex
  ];
  const observer = MockIntersectionObserver.instances
    .filter((o) => o.options.root === track)
    .at(-1);
  if (!observer) throw new Error(`no observer for track ${trackIndex}`);
  return observer;
}

/** Report post visibility the way the browser would, by chapter id. */
function reportChapters(entries: Array<[string, number]>) {
  const observer = chapterObserver();
  act(() => {
    observer.callback(
      entries.map(([chapterId, ratio]) => ({
        target: document.querySelector(`[data-reel-chapter="${chapterId}"]`)!,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      })),
    );
  });
}

/** Report which slide of a track is showing, by its index in that track. */
function reportSlide(trackIndex: number, slideIndex: number) {
  const observer = slideObserver(trackIndex);
  const track = document.querySelectorAll('[data-testid="reel-track"]')[
    trackIndex
  ];
  act(() => {
    observer.callback([
      {
        target: track.querySelectorAll("[data-reel-panel]")[slideIndex],
        isIntersecting: true,
        intersectionRatio: 1,
      },
    ]);
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

/** Pin the height of every snap target of a kind. */
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
        <ReelPanels layout="reel:grid-cols-2">
          <ReelPanel>
            <h2>A whole shop in your pocket</h2>
          </ReelPanel>
          <ReelPanel>
            <p>the explainer</p>
          </ReelPanel>
        </ReelPanels>
      </ReelChapter>
      <ReelChapter id="squeeze" label="The squeeze">
        <ReelPanels>
          <ReelPanel>
            <h2>Your catalogue and TWINT</h2>
          </ReelPanel>
        </ReelPanels>
      </ReelChapter>
      <ReelChapter id="trust" label="Trust">
        <ReelPanels>
          <ReelPanel>
            <h2>Made in Switzerland</h2>
          </ReelPanel>
        </ReelPanels>
      </ReelChapter>
    </ReelStage>,
  );
}

describe("ReelStage — structure", () => {
  it("renders every panel's content, in order, inside named chapter sections", () => {
    renderReel();
    // Nothing is lazy-mounted or hidden behind an interaction: a crawler that
    // never scrolls, and never swipes sideways, still sees the last slide.
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

  it("makes each chapter one full-viewport post that a fling can scroll past", () => {
    renderReel();
    for (const section of Array.from(document.querySelectorAll("section"))) {
      expect(section.className).toContain("snap-start");
      // Deliberately NOT `snap-always` on this axis. `scroll-snap-stop: always`
      // forbids a gesture from passing more than one snap point, so it absorbs
      // the fling: however hard the page is thrown it advances exactly one
      // screen, which reads as enormous inertia and made the reel need a fast,
      // hard swipe to move at all.
      expect(section.className).not.toContain("snap-always");
      // dvh, not svh: filling the screen is the point — the post you leave
      // slides up and this one takes the viewport.
      expect(section.className).toContain(
        "h-[calc(100dvh_-_var(--nav-height))]",
      );
      // `grid`, never `flex`: index.css carries an unlayered
      // `.flex { min-height: 0 }` fix that beats every utility in
      // @layer utilities, so a flex chapter loses its height and the reel
      // silently becomes the long page it replaced.
      expect(section.className).toContain("grid");
      expect(section.className).not.toMatch(/(^|\s)flex(\s|$)/);
      // …and gives the columns back their own height once it is a desktop grid.
      expect(section.className).toContain("reel:h-auto");
    }
  });

  it("makes the panels of a post a horizontal snap track that can't back-navigate", () => {
    renderReel();
    const tracks = screen.getAllByTestId("reel-track");
    expect(tracks.length).toBe(3);
    for (const track of tracks) {
      expect(track.className).toContain("snap-x");
      expect(track.className).toContain("snap-mandatory");
      expect(track.className).toContain("overflow-x-auto");
      // Without this a sideways swipe at the first or last slide chains to the
      // browser's back gesture, so paging a post navigates away from the page.
      expect(track.className).toContain("overscroll-x-contain");
      // Above the breakpoint the sideways axis is gone entirely.
      expect(track.className).toContain("reel:grid");
      expect(track.className).toContain("reel:snap-none");
      // `w-full` against Container's `mx-auto`: a grid item with auto margins
      // does not stretch to its column, so without this the track sized itself
      // to its content — a 692px scroller inside a 393px post, two thirds of it
      // clipped by the chapter's overflow-hidden, with every test still green.
      expect(track.className).toContain("w-full");
      expect(track.className).toContain("reel:w-auto");
    }
    expect(tracks[0].className).toContain("reel:grid-cols-2");

    for (const panel of Array.from(
      document.querySelectorAll("[data-reel-panel]"),
    )) {
      // A slide is the track's width less `--reel-peek` — the sliver of the
      // next slide left showing — and one post tall.
      expect(panel.className).toContain("w-[calc(100%-var(--reel-peek,0px))]");
      expect(panel.className).toContain("h-full");
      expect(panel.className).toContain("shrink-0");
      expect(panel.className).toContain("snap-start");
      // Sideways DOES keep snap-stop: a post is two or three slides, and a
      // fling that skipped from the first to the last would skip the argument.
      expect(panel.className).toContain("snap-always");
      // …and steps out of the snapping once it is a column.
      expect(panel.className).toContain("reel:snap-align-none");
      expect(panel.className).toContain("reel:h-auto");
      // Full width again as a column: the peek is a carousel affordance and
      // would otherwise shave 24px off every desktop column.
      expect(panel.className).toContain("reel:w-auto");
    }
  });

  it("leaves an edge of the next slide showing, and only where there is one", () => {
    // A row of dots is a legend, not an affordance — it tells a reader who has
    // already worked out there is more. The sliver of the next card is what
    // says "swipe" to a reader who hasn't. A single-slide post gets none of it,
    // or it would give up measure to hint at a slide that does not exist.
    renderReel();
    const tracks = screen.getAllByTestId("reel-track");
    for (const track of tracks) {
      const slides = track.querySelectorAll("[data-reel-panel]").length;
      const peek = (track as HTMLElement).style.getPropertyValue("--reel-peek");
      if (slides > 1) {
        expect(track.getAttribute("data-peek")).toBe("true");
        expect(peek).toBe("1.5rem");
      } else {
        expect(track.getAttribute("data-peek")).toBe("false");
        expect(peek).toBe("0rem");
      }
    }
  });

  it("does not declare a scroll-behavior it also asks for in code", () => {
    // `scroll-behavior: smooth` applies to the browser's own scrolls, so the
    // snap settle plays a scripted glide instead of landing — the second half
    // of the "this page has a lot of inertia" complaint. Both the rail and the
    // dots pass `behavior: "smooth"` to scrollTo themselves, so the declaration
    // bought nothing and cost the feel.
    const css = readFileSync(
      path.resolve(__dirname, "..", "..", "index.css"),
      "utf8",
    );
    const reelBlock = css.slice(
      css.indexOf("html[data-reel] {"),
      css.indexOf('html[data-reel="on"]'),
    );
    expect(reelBlock).not.toMatch(/^\s*scroll-behavior:\s*smooth/m);
    for (const track of screen.queryAllByTestId("reel-track")) {
      expect(track.className).not.toContain("scroll-smooth");
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

describe("ReelStage — the dots under a post", () => {
  it("gives a multi-slide post one dot per slide, and a single-slide post none", () => {
    renderReel();
    const dots = screen.getAllByTestId("reel-dots");
    // Only "promise" has more than one slide; a lone dot says nothing.
    expect(dots.length).toBe(1);
    const buttons = Array.from(dots[0].querySelectorAll("button"));
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Slide 1 of 2",
      "Slide 2 of 2",
    ]);
    // The dots belong to the post, so they name it.
    expect(dots[0].getAttribute("aria-label")).toBe("Promise");
    // They are the phone affordance; the columns need no pager.
    expect(dots[0].className).toContain("reel:hidden");
  });

  it("tracks the slide you are on, at a 0.6 threshold inside the track", () => {
    renderReel();
    const track = screen.getAllByTestId("reel-track")[0];
    expect(slideObserver(0).options.threshold).toBe(0.6);
    // Rooted in the track: "most of this slide is showing" is a question about
    // the track's box, not the viewport's.
    expect(slideObserver(0).options.root).toBe(track);

    const dot = (n: number) =>
      screen.getByRole("button", { name: `Slide ${n} of 2` });
    reportSlide(0, 1);
    expect(dot(2).getAttribute("aria-current")).toBe("true");
    expect(dot(1).getAttribute("aria-current")).toBeNull();

    reportSlide(0, 0);
    expect(dot(1).getAttribute("aria-current")).toBe("true");
    expect(dot(2).getAttribute("aria-current")).toBeNull();
  });

  it("scrolls its own track — not the page — when a dot is clicked", () => {
    renderReel();
    const track = screen.getAllByTestId("reel-track")[0];
    const scrollTo = vi.fn();
    track.scrollTo = scrollTo as unknown as typeof track.scrollTo;
    const windowScroll = vi.fn();
    window.scrollTo = windowScroll as unknown as typeof window.scrollTo;

    fireEvent.click(screen.getByRole("button", { name: "Slide 2 of 2" }));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(windowScroll).not.toHaveBeenCalled();
    const [arg] = (scrollTo as unknown as Mock).mock.calls[0];
    expect(arg.behavior).toBe("smooth");
    expect(typeof arg.left).toBe("number");
  });
});

describe("ReelStage — the rail", () => {
  it("derives one dot per chapter from the chapters that rendered", () => {
    renderReel();
    const rail = screen.getByTestId("reel-rail");
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

  it("tracks the active chapter from the posts themselves, at a 0.55 threshold", () => {
    renderReel();
    expect(chapterObserver().options.threshold).toBe(0.55);
    // The viewport is the observation root now that the document scrolls.
    expect(chapterObserver().options.root).toBeUndefined();

    reportChapters([
      ["promise", 1],
      ["trust", 0],
    ]);
    const dot = (name: string) => screen.getByRole("button", { name });
    expect(dot("Promise").getAttribute("aria-current")).toBe("true");
    expect(dot("Trust").getAttribute("aria-current")).toBeNull();

    reportChapters([
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

  it("never snaps mandatorily, whatever the posts measure", () => {
    // `mandatory` forbids the scroller resting anywhere but a snap point, so
    // the browser resists a gesture leaving the current post and drags it back
    // if it did not travel far enough. That resistance is the whole of the
    // "the page feels stuck" problem and no CSS softens it — which is why the
    // strength is no longer a decision. The reel can afford proximity because
    // every target is exactly one snapport tall, so any rest position is
    // within half a screen of one.
    renderReel();
    for (const h of [800, 1400, 2400]) {
      setHeights("section", h);
      remeasure();
      expect(document.documentElement.dataset.reel).toBe("on");
      expect(screen.getByTestId("reel-stage").dataset.reelSnap).toBe("on");
    }
  });

  it("snaps the same way above and below the layout breakpoint", () => {
    // The old code measured the chapters and picked mandatory when they fit.
    // Nothing is measured now, so a resize across the breakpoint cannot leave
    // the two modes disagreeing about how hard to snap.
    mockMatchMedia({ wide: false });
    renderReel();
    setHeights("section", 2400);
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("on");

    mockMatchMedia({ wide: true });
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("on");
  });

  it("resolves to a proximity snap in the stylesheet", () => {
    // The component only says whether to snap; index.css says how hard. A
    // `mandatory` creeping back into that rule would undo the fix above
    // without failing any of the assertions on the component.
    const css = readFileSync(
      path.resolve(__dirname, "..", "..", "index.css"),
      "utf8",
    );
    expect(css).toMatch(
      /html\[data-reel="on"\]\s*\{[^}]*scroll-snap-type:\s*y proximity/,
    );
    expect(css).not.toContain("scroll-snap-type: y mandatory");
  });

  it("switches snapping off entirely under prefers-reduced-motion", () => {
    mockMatchMedia({ wide: true, reduce: true });
    renderReel();
    setHeights("section", 800);
    remeasure();
    expect(document.documentElement.dataset.reel).toBeUndefined();
  });

  it("takes the declaration off <html> when the reel unmounts", () => {
    // Every other page shares that element — a stale snap-type would make the
    // whole site snap.
    const { unmount } = renderReel();
    setHeights("section", 800);
    remeasure();
    expect(document.documentElement.dataset.reel).toBe("on");
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
