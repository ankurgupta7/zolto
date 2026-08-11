import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Container } from "./Container";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * ReelStage / ReelChapter / ReelPanels / ReelPanel — the homepage as a reel of
 * carousel posts.
 *
 * Two axes, and the whole point is that a phone user already knows both:
 *
 * - **Down** moves between chapters. A chapter is one post: exactly the height
 *   of the viewport, so the one you leave slides up and the next one fills the
 *   screen. `scroll-snap-stop: always` means one flick is one post rather than
 *   four — that is the difference between "snappy" and "a long page that
 *   happens to snap".
 * - **Sideways** moves through the panels *inside* a post, the way a
 *   multi-picture post works, with a row of dots saying where you are. Content
 *   that will not fit a phone screen goes sideways instead of making the post
 *   taller, which is what keeps every post exactly one screen on every phone.
 *
 * Above `REEL_LAYOUT_QUERY` — a viewport roomy enough to hold a whole chapter at
 * once — the sideways axis collapses: the panels become the chapter's columns
 * and the dots go away, which is what the desktop page has always looked like.
 * Same markup, same copy, one mechanism.
 *
 * Three things stay load-bearing:
 *
 * 1. **Snapping is on the document scroller.** Not a nested full-height box: on
 *    iOS Safari a nested vertical scroller stops the address bar collapsing and
 *    gets worse momentum. `html[data-reel]` in index.css carries it; this
 *    component only decides the strength.
 * 2. **Strength adapts to what fits.** In carousel mode every post is exactly
 *    one screen, so snapping is always `mandatory`. In column mode chapters are
 *    measured, and one that overflows downgrades the scroller to `proximity` —
 *    a mandatory target taller than the screen is one whose bottom can never be
 *    read. `prefers-reduced-motion` turns snapping off altogether.
 * 3. **No keyboard interception.** Nothing here listens for keys. PageUp,
 *    PageDown, Home, End, the arrows and tab-to-focus do exactly what the
 *    browser does with them, and every slide is reachable by its dot.
 *
 * SEO and screen readers see none of it: every chapter is a real `<section>`
 * with an accessible name and its headings, in source order, always mounted,
 * never behind an interaction.
 */

/** Fraction of a post that must show for the rail to call it active. */
const ACTIVE_THRESHOLD = 0.55;
/** Fraction of a slide that must show for its dot to light. */
const SLIDE_THRESHOLD = 0.6;

/**
 * The viewport is roomy enough for a whole chapter to be one screen without the
 * sideways axis. Must stay identical to the `reel` custom variant in index.css —
 * the layout is CSS's decision and this is only how the measuring code asks
 * which way it went. ReelStage.test.tsx compares the two strings.
 */
export const REEL_LAYOUT_QUERY = "(min-width: 1024px) and (min-height: 820px)";
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

type SnapMode = "mandatory" | "proximity" | "off";

function mediaMatches(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches ?? false;
}

/** Subscribe to a media query, tolerating the pre-2019 listener API. */
function watchMedia(query: string, onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(query);
  if (mql.addEventListener) {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener?.(onChange);
  return () => mql.removeListener?.(onChange);
}

/** The sticky nav's height, which `scroll-padding-top` already accounts for. */
function navHeight(): number {
  if (typeof document === "undefined") return 0;
  return document.querySelector("header")?.getBoundingClientRect().height ?? 0;
}

interface Registered {
  id: string;
  label: string;
  el: HTMLElement;
}

interface StageApi {
  registerChapter: (chapter: Registered) => () => void;
  scrollToChapter: (id: string) => void;
  chapters: Array<{ id: string; label: string }>;
  activeId: string | null;
  /** Chapter ids on screen — what pauses the hero video. */
  visibleIds: readonly string[];
  snapMode: SnapMode;
}

const StageContext = createContext<StageApi | null>(null);
const ChapterContext = createContext<{
  id: string;
  label: string;
  visible: boolean;
} | null>(null);

/**
 * The chapters this stage is showing, in document order, plus which one is
 * active. Returns an empty reel outside a `ReelStage`.
 */
export function useReelChapters(): {
  chapters: Array<{ id: string; label: string }>;
  activeId: string | null;
} {
  const stage = useContext(StageContext);
  return {
    chapters: stage?.chapters ?? [],
    activeId: stage?.activeId ?? null,
  };
}

/**
 * Whether the chapter around this component is on screen. `ExplainerVideo` uses
 * it to stop playing once its post is scrolled away, reading the stage's
 * observer rather than starting a second one. Outside a chapter (a sub-page, a
 * test) it answers "visible", so nothing that keys off it stalls.
 */
export function useReelChapterVisible(): boolean {
  const chapter = useContext(ChapterContext);
  return chapter ? chapter.visible : true;
}

function byDocumentPosition<T extends { el: HTMLElement }>(a: T, b: T) {
  if (a.el === b.el) return 0;
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}

/** The chapter rail: one dot per post, fixed to the right edge. */
function ChapterRail({ label }: { label: string }) {
  const stage = useContext(StageContext);
  if (!stage || stage.chapters.length < 2) return null;

  return (
    <nav
      aria-label={label}
      data-testid="reel-rail"
      className="pointer-events-none fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-4 md:flex"
    >
      {stage.chapters.map((chapter) => {
        const active = chapter.id === stage.activeId;
        return (
          <button
            key={chapter.id}
            type="button"
            aria-label={chapter.label}
            aria-current={active ? "true" : undefined}
            onClick={() => stage.scrollToChapter(chapter.id)}
            className="pointer-events-auto group flex items-center justify-end gap-2.5 focus-visible:outline-none"
          >
            {/* Every label, all the time — not just the active one.
                Eight words down the edge are the argument's outline, and a
                reader who can see how much is left tolerates more of it than
                one being fed a screen at a time with no sense of the end. The
                inactive ones go muted rather than invisible so the active
                chapter still reads as the current one at a glance. */}
            <span
              aria-hidden
              className={`whitespace-nowrap text-[11px] uppercase tracking-[0.16em] transition-all duration-300 group-hover:text-[var(--brand-accent)] group-hover:opacity-100 group-focus-visible:text-[var(--brand-accent)] group-focus-visible:opacity-100 ${
                active
                  ? "text-[var(--brand-accent)] opacity-100"
                  : "text-[var(--brand-muted)] opacity-55"
              }`}
            >
              {chapter.label}
            </span>
            <span
              aria-hidden
              className={`rounded-full bg-[var(--brand-accent)] transition-all duration-300 ${
                active
                  ? "h-2.5 w-2.5 opacity-100"
                  : "h-1.5 w-1.5 opacity-35 group-hover:opacity-70"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}

export function ReelStage({
  label,
  children,
}: {
  /** Accessible name for the chapter rail, e.g. "Chapters". */
  label: string;
  children: ReactNode;
}) {
  const [chapters, setChapters] = useState<Registered[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<readonly string[]>([]);
  const [snapMode, setSnapMode] = useState<SnapMode>("off");
  // Ratios live in a ref: the observer reports only what crossed the threshold,
  // so picking the active post needs the last reading for the others too.
  const ratios = useRef(new Map<HTMLElement, number>());

  const registerChapter = useCallback((chapter: Registered) => {
    setChapters((prev) =>
      [...prev.filter((c) => c.el !== chapter.el), chapter].sort(
        byDocumentPosition,
      ),
    );
    return () =>
      setChapters((prev) => {
        ratios.current.delete(chapter.el);
        return prev.filter((c) => c.el !== chapter.el);
      });
  }, []);

  // ── Snap strength ─────────────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (mediaMatches(REDUCE_QUERY) || chapters.length === 0) {
        setSnapMode("off");
        return;
      }
      // Carousel mode: every post is exactly one screen by construction, so
      // there is nothing to measure and nothing that can trap the reader.
      if (!mediaMatches(REEL_LAYOUT_QUERY)) {
        setSnapMode("mandatory");
        return;
      }
      const band = window.innerHeight - navHeight();
      const fits = chapters.every((c) => c.el.offsetHeight <= band + 2);
      setSnapMode(fits ? "mandatory" : "proximity");
    };

    measure();
    const stopReduce = watchMedia(REDUCE_QUERY, measure);
    const stopLayout = watchMedia(REEL_LAYOUT_QUERY, measure);
    window.addEventListener("resize", measure);
    // Content reflows without a resize too — a language switch, a font landing.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    for (const chapter of chapters) observer?.observe(chapter.el);
    return () => {
      stopReduce();
      stopLayout();
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [chapters]);

  // The scroller is the document, so the snap declaration goes on <html> — and
  // comes off again when the reel unmounts, or every other page inherits it.
  useEffect(() => {
    const root = document.documentElement;
    if (snapMode === "off") {
      delete root.dataset.reel;
    } else {
      root.dataset.reel = snapMode;
    }
    return () => {
      delete root.dataset.reel;
    };
  }, [snapMode]);

  // ── Which post the rail should light ──────────────────────────────────────
  useEffect(() => {
    if (chapters.length === 0) {
      setActiveId(null);
      setVisibleIds([]);
      return;
    }
    // No observer (jsdom, ancient browsers): call the first post active and
    // every post visible rather than leaving the rail unlit and the video
    // paused for good.
    if (typeof IntersectionObserver === "undefined") {
      setActiveId(chapters[0].id);
      setVisibleIds(chapters.map((c) => c.id));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.current.set(
            entry.target as HTMLElement,
            entry.isIntersecting ? entry.intersectionRatio || 1 : 0,
          );
        }
        const showing: string[] = [];
        let best: string | null = null;
        let bestRatio = 0;
        for (const chapter of chapters) {
          const ratio = ratios.current.get(chapter.el) ?? 0;
          if (ratio > 0) showing.push(chapter.id);
          if (ratio > bestRatio) {
            best = chapter.id;
            bestRatio = ratio;
          }
        }
        setVisibleIds(showing);
        if (best) setActiveId(best);
      },
      { threshold: ACTIVE_THRESHOLD },
    );
    for (const chapter of chapters) observer.observe(chapter.el);
    return () => observer.disconnect();
  }, [chapters]);

  const scrollToChapter = useCallback(
    (id: string) => {
      const chapter = chapters.find((c) => c.id === id);
      if (!chapter) return;
      // scrollIntoView is deliberately not used: it picks its own alignment and
      // walks every scrollable ancestor, which on a snapping scroller fights the
      // snap points and can leave the page mid-post.
      const top =
        chapter.el.getBoundingClientRect().top + window.scrollY - navHeight();
      if (typeof window.scrollTo !== "function") return;
      window.scrollTo({
        top,
        behavior: mediaMatches(REDUCE_QUERY) ? "auto" : "smooth",
      });
    },
    [chapters],
  );

  const api = useMemo<StageApi>(
    () => ({
      registerChapter,
      scrollToChapter,
      chapters: chapters.map(({ id, label: chapterLabel }) => ({
        id,
        label: chapterLabel,
      })),
      activeId,
      visibleIds,
      snapMode,
    }),
    [
      registerChapter,
      scrollToChapter,
      chapters,
      activeId,
      visibleIds,
      snapMode,
    ],
  );

  return (
    <StageContext.Provider value={api}>
      <div data-testid="reel-stage" data-reel-snap={snapMode}>
        {children}
      </div>
      <ChapterRail label={label} />
    </StageContext.Provider>
  );
}

export function ReelChapter({
  label,
  id,
  className = "",
  children,
}: {
  /** Rail label and the section's accessible name. */
  label: string;
  /** Stable id — also the fragment target (`/#product`). */
  id: string;
  /** The chapter's background band, e.g. `bg-[var(--brand-ink)]`. */
  className?: string;
  children: ReactNode;
}) {
  const stage = useContext(StageContext);
  const ref = useRef<HTMLElement>(null);
  const registerChapter = stage?.registerChapter;

  useEffect(() => {
    const el = ref.current;
    if (!el || !registerChapter) return;
    return registerChapter({ id, label, el });
  }, [registerChapter, id, label]);

  const visible = stage ? stage.visibleIds.includes(id) : true;
  const value = useMemo(() => ({ id, label, visible }), [id, label, visible]);

  return (
    <ChapterContext.Provider value={value}>
      {/* One post, exactly one screen: `dvh` rather than `svh` because filling
          the viewport is the point — the post you leave slides up and this one
          takes the whole screen. `snap-always` is what makes one flick advance
          one post instead of four.

          `grid`, never `flex`: index.css carries an unlayered
          `.flex { min-height: 0 }` fix that beats every utility in
          @layer utilities, so a flex chapter loses its height and the reel
          silently becomes the long page it replaced. */}
      <section
        ref={ref}
        id={id}
        data-reel-chapter={id}
        aria-label={label}
        className={`grid h-[calc(100dvh_-_var(--nav-height))] snap-start snap-always grid-rows-[1fr_auto] overflow-hidden ${className} reel:h-auto reel:min-h-[calc(100dvh_-_var(--nav-height))] reel:grid-rows-none reel:content-center reel:overflow-visible reel:py-5`}
      >
        {children}
      </section>
    </ChapterContext.Provider>
  );
}

interface PanelsApi {
  register: (panel: Registered) => () => void;
  activeIndex: number;
  scrollToIndex: (index: number) => void;
  count: number;
}

const PanelsContext = createContext<PanelsApi | null>(null);

/**
 * The slides of one post, and the dots under them.
 *
 * Below the layout breakpoint this is a horizontal snap scroller: one slide per
 * screen, swiped sideways. At and above it, it is the chapter's grid and
 * `layout` places the panels as columns — the dots come off with the scroller,
 * because there is nothing left to page through.
 */
export function ReelPanels({
  layout = "",
  children,
}: {
  /**
   * How the panels sit once the chapter is one screen — grid classes under the
   * `reel:` variant, e.g. `reel:grid-cols-2 reel:items-center`.
   */
  layout?: string;
  children: ReactNode;
}) {
  const { t } = useMarketingT();
  const chapter = useContext(ChapterContext);
  const trackRef = useRef<HTMLDivElement>(null);
  const [panels, setPanels] = useState<Registered[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const register = useCallback((panel: Registered) => {
    setPanels((prev) =>
      [...prev.filter((p) => p.el !== panel.el), panel].sort(
        byDocumentPosition,
      ),
    );
    return () => setPanels((prev) => prev.filter((p) => p.el !== panel.el));
  }, []);

  // Which slide is showing, from the track's own observer rather than from
  // scroll arithmetic — the slides are the width of the track, so "most of it
  // is showing" is exactly the question the dots are asking.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || panels.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      setActiveIndex(0);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = panels.findIndex((p) => p.el === entry.target);
          if (index >= 0) setActiveIndex(index);
        }
      },
      { root: track, threshold: SLIDE_THRESHOLD },
    );
    for (const panel of panels) observer.observe(panel.el);
    return () => observer.disconnect();
  }, [panels]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const panel = panels[index];
      if (!track || !panel) return;
      const left =
        panel.el.getBoundingClientRect().left -
        track.getBoundingClientRect().left +
        track.scrollLeft;
      if (typeof track.scrollTo === "function") {
        track.scrollTo({
          left,
          behavior: mediaMatches(REDUCE_QUERY) ? "auto" : "smooth",
        });
      } else {
        track.scrollLeft = left;
      }
    },
    [panels],
  );

  const api = useMemo<PanelsApi>(
    () => ({ register, activeIndex, scrollToIndex, count: panels.length }),
    [register, activeIndex, scrollToIndex, panels.length],
  );

  return (
    <PanelsContext.Provider value={api}>
      {/* overscroll-x-contain matters more than it looks: without it a sideways
          swipe at the first or last slide chains to the browser's own
          back-gesture, so paging a post can navigate away from the page. */}
      <Container
        ref={trackRef}
        data-testid="reel-track"
        // Full-bleed while it is a scroller — the gutter belongs to each slide,
        // so a swipe carries the whole screen — and the ordinary Container
        // rhythm again once the panels are columns.
        //
        // `w-full` is load-bearing, not decorative: Container brings `mx-auto`,
        // and a grid item with auto margins does not stretch to its column, so
        // this box sized itself to its content instead — a 692px track inside a
        // 393px post, clipped by the chapter's overflow-hidden. Every slide
        // looked plausible and every test passed; the right-hand third of the
        // page was simply gone.
        className={`no-scrollbar flex h-full w-full max-w-none snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth px-0 reel:grid reel:h-auto reel:w-auto reel:max-w-6xl reel:snap-none reel:overflow-visible reel:px-6 ${layout}`}
      >
        {children}
      </Container>

      {panels.length > 1 && (
        <nav
          aria-label={chapter?.label ?? ""}
          data-testid="reel-dots"
          className="flex items-center justify-center gap-2 pb-3 pt-1.5 reel:hidden"
        >
          {panels.map((panel, index) => (
            <button
              key={index}
              type="button"
              aria-label={t("landing.reel.slide", {
                n: index + 1,
                total: panels.length,
              })}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => scrollToIndex(index)}
              className={`h-1.5 rounded-full bg-[var(--brand-accent)] transition-all duration-300 ${
                index === activeIndex ? "w-5 opacity-100" : "w-1.5 opacity-35"
              }`}
            />
          ))}
        </nav>
      )}
    </PanelsContext.Provider>
  );
}

export function ReelPanel({
  className = "",
  children,
}: {
  /**
   * Where this panel sits once the chapter is one screen — grid placement under
   * the `reel:` variant, e.g. `reel:col-start-2 reel:row-span-2`.
   */
  className?: string;
  children: ReactNode;
}) {
  const panels = useContext(PanelsContext);
  const chapter = useContext(ChapterContext);
  const ref = useRef<HTMLDivElement>(null);
  const register = panels?.register;
  const chapterId = chapter?.id;

  useEffect(() => {
    const el = ref.current;
    if (!el || !register || !chapterId) return;
    return register({ id: chapterId, label: chapter?.label ?? "", el });
  }, [register, chapterId, chapter?.label]);

  return (
    <div
      ref={ref}
      data-reel-panel={chapterId ?? ""}
      // A slide is the width of the track and the height of the post. `overflow-y`
      // is the safety valve for the rare slide that still doesn't fit (a 375x667
      // phone, a long translation): it scrolls inside itself rather than being
      // clipped, and chains to the page once it reaches its end.
      className={`grid h-full w-full shrink-0 snap-start snap-always content-center overflow-y-auto px-6 py-3 sm:py-6 reel:h-auto reel:w-auto reel:shrink reel:snap-align-none reel:overflow-visible reel:px-0 reel:py-0 ${className}`}
    >
      {children}
    </div>
  );
}
