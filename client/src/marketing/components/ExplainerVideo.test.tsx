import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";
import { ExplainerVideo } from "./ExplainerVideo";
import { ReelChapter, ReelStage } from "./ReelStage";

/**
 * The explainer plays like a hero video and not like an advert: silent while
 * you read, stopped once you've scrolled past, sound only when asked. Under
 * reduced motion it is a poster and a play button.
 */

const SRC = "/video/zolto-explainer.mp4";
const POSTER = "/video/zolto-explainer-poster.svg";

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeAll(() => {
  // jsdom has no media pipeline; both are "not implemented" stubs.
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: (...args: unknown[]) => play(...args),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: (...args: unknown[]) => pause(...args),
  });
});

function mockMatchMedia({ reduce = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : true,
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
  play.mockClear();
  pause.mockClear();
  mockMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
});

function renderVideo() {
  return render(
    <ExplainerVideo
      src={SRC}
      poster={POSTER}
      captionKey="landing.video.caption"
    />,
  );
}

function videoEl() {
  return screen.getByTestId("explainer-video-el") as HTMLVideoElement;
}

describe("ExplainerVideo", () => {
  it("loops silently, inline, with the poster ready before the file is", () => {
    renderVideo();
    const video = videoEl();
    expect(video.muted).toBe(true);
    // playsinline, not fullscreen-on-tap: an iOS hero video that hijacks the
    // screen is worse than no hero video.
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.getAttribute("poster")).toBe(POSTER);
    expect(video.getAttribute("src")).toBe(SRC);
    // No controls until the reader asks for them.
    expect(video.hasAttribute("controls")).toBe(false);
    expect(play).toHaveBeenCalled();
  });

  it("paints the poster as the frame's own background, so a missing file still shows the product", () => {
    const { container } = renderVideo();
    const frame = container.querySelector<HTMLElement>("figure > div");
    expect(frame?.style.backgroundImage).toContain(POSTER);
    // 16/10, which is the ratio the poster is drawn at.
    expect(frame?.className).toContain("aspect-[16/10]");
  });

  it("unmutes, shows controls and stops looping when the play button is clicked", () => {
    renderVideo();
    fireEvent.click(screen.getByRole("button", { name: /play the zolto/i }));

    const video = videoEl();
    expect(video.muted).toBe(false);
    expect(video.hasAttribute("controls")).toBe(true);
    // The silent loop is over — this is now an ordinary video the reader owns.
    expect(video.hasAttribute("loop")).toBe(false);
    expect(play).toHaveBeenCalled();
    // The gold button steps out of the way of the native controls.
    expect(
      screen.queryByRole("button", { name: /play the zolto/i }),
    ).toBeNull();
  });

  it("never autoplays under prefers-reduced-motion", () => {
    mockMatchMedia({ reduce: true });
    renderVideo();
    expect(videoEl().hasAttribute("autoplay")).toBe(false);
    expect(play).not.toHaveBeenCalled();
    // Poster plus play button is the whole component until they ask.
    expect(
      screen.getByRole("button", { name: /play the zolto/i }),
    ).toBeTruthy();
  });

  it("still plays when asked, under reduced motion", () => {
    mockMatchMedia({ reduce: true });
    renderVideo();
    fireEvent.click(screen.getByRole("button", { name: /play the zolto/i }));
    expect(play).toHaveBeenCalled();
    expect(videoEl().muted).toBe(false);
  });

  it("captions the frame in the brand's hand", () => {
    const { container } = renderVideo();
    const caption = container.querySelector("figcaption");
    expect(caption?.className).toContain("font-hand");
    expect(caption?.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe("ExplainerVideo inside a reel chapter", () => {
  class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = [];
    constructor(
      readonly callback: (entries: unknown[]) => void,
      readonly options: IntersectionObserverInit,
    ) {
      MockIntersectionObserver.instances.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  beforeEach(() => {
    MockIntersectionObserver.instances.length = 0;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  function renderInChapter() {
    return render(
      <ReelStage label="Chapters">
        <ReelChapter id="promise" label="Promise">
          <h2>Promise</h2>
          <ExplainerVideo
            src={SRC}
            poster={POSTER}
            captionKey="landing.video.caption"
          />
        </ReelChapter>
        <ReelChapter id="squeeze" label="The squeeze">
          <h2>Squeeze</h2>
        </ReelChapter>
      </ReelStage>,
    );
  }

  function report(id: string, ratio: number) {
    const observer = MockIntersectionObserver.instances.at(-1)!;
    act(() => {
      observer.callback([
        {
          target: document.querySelector(`[data-reel-chapter="${id}"]`)!,
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        },
      ]);
    });
  }

  it("pauses once its chapter has scrolled away, and resumes on the way back", () => {
    renderInChapter();
    report("promise", 1);
    play.mockClear();
    pause.mockClear();

    report("promise", 0);
    expect(pause).toHaveBeenCalled();

    pause.mockClear();
    report("promise", 1);
    expect(play).toHaveBeenCalled();
  });
});
