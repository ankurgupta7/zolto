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

/**
 * ReelStage / ReelChapter — the homepage's vertical reel.
 *
 * The landing page used to be sixteen stacked bands. It is now six chapters,
 * each the height of the viewport, with momentum scrolling, snap alignment to
 * the top of each chapter, and a progress rail down the right-hand side. The
 * copy, the components and the colour tokens are unchanged — this is the
 * choreography only.
 *
 * Three things about this treatment are load-bearing, and all three exist
 * because `scroll-snap-type: y mandatory` is hostile if you apply it blindly:
 *
 * 1. **It is a desktop treatment.** Below 768px, and under
 *    `prefers-reduced-motion: reduce`, the stage stops being a scroll container
 *    at all: no fixed height, no snapping, no smooth scroll. Mobile gets the
 *    plain long scroll it always had, which is also what a merchant on a train
 *    with a thumb on the screen actually wants.
 * 2. **A chapter taller than the stage opts itself out.** Mandatory snapping on
 *    a chapter that doesn't fit means the reader can never see its bottom — the
 *    scroller keeps yanking them back to its top. Each chapter measures itself
 *    against the stage and switches to `scroll-snap-align: none` when it
 *    overflows, so it scrolls like an ordinary band.
 * 3. **No keyboard interception.** Nothing here listens for keys. PageUp,
 *    PageDown, Home, End, the arrows and tab-to-focus all do exactly what the
 *    browser does with them inside any other scroll container.
 *
 * The rail is derived from the chapters that actually rendered — each
 * `ReelChapter` registers its own id and label — so it cannot drift from the
 * page the way a hardcoded list of six labels would. Which chapter is *active*
 * comes from one `IntersectionObserver` at `threshold: 0.55` rooted on the
 * stage, not from scroll arithmetic: with chapters the height of the scroller,
 * "more than half of it is showing" is exactly the question the rail is asking.
 *
 * SEO and screen readers see none of this. Every chapter is a real `<section>`
 * with an accessible name and its headings, rendered in source order, always
 * mounted, never hidden behind an interaction.
 */

/** Fraction of a chapter that must be showing for the rail to call it active. */
const ACTIVE_THRESHOLD = 0.55;

/** The reel is a desktop treatment; below this the page is a plain long scroll. */
const DESKTOP_QUERY = "(min-width: 768px)";
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function mediaMatches(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches ?? false;
}

/**
 * Whether to run the reel at all. Read synchronously during the first render
 * (this surface is client-rendered) rather than in an effect: flipping the page
 * from a long scroll into a viewport-locked stage after mount is a layout shift
 * on load, and the reel exists to make the page feel considered.
 */
function computeReelActive(): boolean {
  return mediaMatches(DESKTOP_QUERY) && !mediaMatches(REDUCE_QUERY);
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

interface RegisteredChapter {
  id: string;
  label: string;
  el: HTMLElement;
}

interface StageApi {
  register: (chapter: RegisteredChapter) => () => void;
  scrollToChapter: (id: string) => void;
  chapters: Array<{ id: string; label: string }>;
  activeId: string | null;
  /** Ids currently past the active threshold — what pauses the video. */
  visibleIds: readonly string[];
  reelActive: boolean;
  /** The scroll container itself. A getter, so it survives the first render. */
  getStageEl: () => HTMLElement | null;
}

const StageContext = createContext<StageApi | null>(null);
const ChapterContext = createContext<{ id: string; visible: boolean } | null>(
  null,
);

/**
 * The chapters this stage is showing, in document order, plus which one is
 * active. Exposed for the rail and for anything else that wants to follow the
 * reel; returns an empty reel outside a `ReelStage`.
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
 * Whether the chapter around this component is on screen. Used by
 * `ExplainerVideo` to stop playing once its chapter is scrolled away — it reads
 * the stage's observer rather than starting a second one. Outside a chapter
 * (a sub-page, a test) it answers "visible", so nothing that keys off it stalls.
 */
export function useReelChapterVisible(): boolean {
  const chapter = useContext(ChapterContext);
  return chapter ? chapter.visible : true;
}

function byDocumentPosition(a: RegisteredChapter, b: RegisteredChapter) {
  if (a.el === b.el) return 0;
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}

/** The progress rail: one dot per chapter, fixed to the right edge. */
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
            {/* The label rides beside the dot: always there for a mouse or a
                keyboard, faded out until the chapter is the one you're in. */}
            <span
              aria-hidden
              className={`whitespace-nowrap text-[11px] uppercase tracking-[0.16em] text-[var(--brand-accent)] transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 ${
                active ? "opacity-100" : "opacity-0"
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
  trailer,
}: {
  /** Accessible name for the progress rail, e.g. "Chapters". */
  label: string;
  children: ReactNode;
  /**
   * Content that follows the last chapter inside the scroll container — the
   * site footer. The stage is the page's scroller and `overscroll-contain`
   * deliberately stops scroll chaining, so anything left *outside* it (the
   * legal links, for one) would be unreachable with a wheel or a trackpad.
   * `MarketingShell` stands its own footer down for the routes that own their
   * scroll container; see CHROME_OWNED_SCROLL there.
   */
  trailer?: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [registered, setRegistered] = useState<RegisteredChapter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<readonly string[]>([]);
  const [reelActive, setReelActive] = useState(computeReelActive);
  // Ratios live in a ref, not state: the observer reports only the chapters
  // that crossed the threshold, so deciding the active one needs the last
  // reading for the others too.
  const ratios = useRef(new Map<string, number>());

  useEffect(() => {
    const sync = () => setReelActive(computeReelActive());
    const stopDesktop = watchMedia(DESKTOP_QUERY, sync);
    const stopReduce = watchMedia(REDUCE_QUERY, sync);
    sync();
    return () => {
      stopDesktop();
      stopReduce();
    };
  }, []);

  const register = useCallback((chapter: RegisteredChapter) => {
    setRegistered((prev) =>
      [...prev.filter((c) => c.el !== chapter.el), chapter].sort(
        byDocumentPosition,
      ),
    );
    return () => {
      setRegistered((prev) => prev.filter((c) => c.el !== chapter.el));
      ratios.current.delete(chapter.id);
    };
  }, []);

  useEffect(() => {
    if (registered.length === 0) {
      setActiveId(null);
      setVisibleIds([]);
      return;
    }
    // No observer (jsdom, ancient browsers): the reel degrades to a long page,
    // so call the first chapter active and every chapter visible rather than
    // leaving the rail unlit and the video paused forever.
    if (typeof IntersectionObserver === "undefined") {
      setActiveId(registered[0].id);
      setVisibleIds(registered.map((c) => c.id));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-reel-chapter");
          if (!id) continue;
          ratios.current.set(
            id,
            entry.isIntersecting ? entry.intersectionRatio || 1 : 0,
          );
        }
        const showing = registered.filter(
          (c) => (ratios.current.get(c.id) ?? 0) > 0,
        );
        setVisibleIds(showing.map((c) => c.id));
        // The chapter showing most of itself wins. Ties keep the earlier one,
        // so a rail dot never flickers between two chapters at a snap point.
        let best: string | null = null;
        let bestRatio = 0;
        for (const c of registered) {
          const ratio = ratios.current.get(c.id) ?? 0;
          if (ratio > bestRatio) {
            best = c.id;
            bestRatio = ratio;
          }
        }
        if (best) setActiveId(best);
      },
      {
        root: reelActive ? stageRef.current : null,
        threshold: ACTIVE_THRESHOLD,
      },
    );
    for (const chapter of registered) observer.observe(chapter.el);
    return () => observer.disconnect();
  }, [registered, reelActive]);

  const scrollToChapter = useCallback(
    (id: string) => {
      const chapter = registered.find((c) => c.id === id);
      if (!chapter) return;
      const behavior: ScrollBehavior = mediaMatches(REDUCE_QUERY)
        ? "auto"
        : "smooth";
      const stage = stageRef.current;

      // scrollIntoView is deliberately not used: it walks every scrollable
      // ancestor and picks its own alignment, which on a snapping container
      // fights the snap points and can leave the page mid-chapter.
      if (reelActive && stage) {
        const top =
          chapter.el.getBoundingClientRect().top -
          stage.getBoundingClientRect().top +
          stage.scrollTop;
        if (typeof stage.scrollTo === "function") {
          stage.scrollTo({ top, behavior });
        } else {
          stage.scrollTop = top;
        }
        return;
      }

      // Plain long scroll: the window is the scroller, and the sticky bar has
      // to come off the target or the chapter's heading lands underneath it.
      const navHeight =
        document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top =
        chapter.el.getBoundingClientRect().top + window.scrollY - navHeight;
      if (typeof window.scrollTo === "function") {
        window.scrollTo({ top, behavior });
      }
    },
    [registered, reelActive],
  );

  const api = useMemo<StageApi>(
    () => ({
      register,
      scrollToChapter,
      chapters: registered.map(({ id, label: chapterLabel }) => ({
        id,
        label: chapterLabel,
      })),
      activeId,
      visibleIds,
      reelActive,
      getStageEl: () => stageRef.current,
    }),
    [register, scrollToChapter, registered, activeId, visibleIds, reelActive],
  );

  return (
    <StageContext.Provider value={api}>
      <div
        ref={stageRef}
        data-testid="reel-stage"
        data-reel-active={reelActive ? "true" : "false"}
        className={
          reelActive
            ? "h-[calc(100dvh_-_var(--nav-height))] snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth"
            : ""
        }
      >
        {/* The stage is the page's scroll container, so it owns <main> too —
            MarketingShell steps aside for these routes. Snap alignment is not
            limited to direct children of the scroller, so the chapters can sit
            inside the landmark where they belong. */}
        <main>{children}</main>
        {trailer}
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
  const [overflows, setOverflows] = useState(false);
  const reelActive = stage?.reelActive ?? false;
  const register = stage?.register;

  useEffect(() => {
    const el = ref.current;
    if (!el || !register) return;
    return register({ id, label, el });
  }, [register, id, label]);

  // A chapter that doesn't fit the stage stops snapping — see the note at the
  // top of this file. Measured rather than guessed: which chapters overflow
  // depends on the language, the font, and how wide the window is.
  const getStageEl = stage?.getStageEl;
  useEffect(() => {
    const el = ref.current;
    const stageEl = getStageEl?.() ?? null;
    if (!el || !stageEl || !reelActive) {
      setOverflows(false);
      return;
    }
    const measure = () => {
      const available = stageEl.clientHeight;
      setOverflows(available > 0 && el.offsetHeight > available + 1);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    observer?.observe(stageEl);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reelActive, getStageEl]);

  const visible = stage ? stage.visibleIds.includes(id) : true;
  const chapterValue = useMemo(() => ({ id, visible }), [id, visible]);

  // `grid content-center`, not `flex flex-col justify-center`: index.css carries
  // an unlayered `.flex { min-width: 0; min-height: 0 }` fix, and an unlayered
  // rule beats every utility in `@layer utilities` whatever its specificity — so
  // a flex chapter's min-height computed to 0 and the reel rendered as the plain
  // long page it replaced. The first screenshot of this feature is what caught
  // that; no DOM assertion could have.
  const chapterClass = reelActive
    ? `min-h-[calc(100dvh_-_var(--nav-height))] py-6 ${
        overflows ? "snap-align-none" : "snap-start"
      }`
    : "py-16 md:py-20";

  return (
    <ChapterContext.Provider value={chapterValue}>
      <section
        ref={ref}
        id={id}
        data-reel-chapter={id}
        data-reel-snap={reelActive && !overflows ? "start" : "none"}
        aria-label={label}
        className={`grid content-center ${chapterClass} ${className}`}
      >
        {children}
      </section>
    </ChapterContext.Provider>
  );
}
