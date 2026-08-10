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
 * ReelStage / ReelChapter / ReelPanel — the homepage's vertical reel.
 *
 * The homepage is six chapters. A **panel** is one screen of a chapter, and the
 * panel — not the chapter — is what scroll-snapping aligns to. On a roomy
 * viewport a chapter's panels lay out as its columns, so the chapter *is* one
 * screen and one panel is one column (what the desktop page has always looked
 * like). On a phone the same panels stack, and each one is a screen you swipe
 * to. Same markup, same copy, one mechanism.
 *
 * That indirection is the whole point, and it exists because the first version
 * of this reel snapped whole chapters and measurably did not work anywhere
 * except the viewport it was tuned to:
 *
 *   iPhone 15 Pro   393x852   0 of 6 chapters snapped (reel gated off below 768px;
 *                             a chapter is ~2.8 screens tall at phone width)
 *   iPad portrait   768x1024  2 of 6 (four chapters 1.4-1.6x the screen)
 *   laptop          1280x800  2 of 6 (four chapters 1.03-1.14x the screen)
 *   laptop          1440x900  6 of 6
 *
 * Three things stay load-bearing, all because `snap-type: mandatory` is hostile
 * applied blindly:
 *
 * 1. **Snapping is on the document scroller.** Not a nested full-height box: on
 *    iOS Safari a nested scroller stops the address bar collapsing, gets worse
 *    momentum, and needs `overscroll-contain`, which then makes the footer
 *    unreachable by wheel. `html[data-reel]` in index.css carries the snapping;
 *    this component only decides the strength.
 * 2. **Strength adapts to what actually fits.** Every snap target is measured
 *    against the viewport; one that overflows downgrades the whole scroller to
 *    `proximity`, because a mandatory target taller than the screen is a target
 *    whose bottom can never be read. `prefers-reduced-motion` turns snapping off
 *    altogether.
 * 3. **No keyboard interception.** Nothing here listens for keys. PageUp,
 *    PageDown, Home, End, the arrows and tab-to-focus do exactly what the
 *    browser does with them.
 *
 * SEO and screen readers see none of it: every chapter is a real `<section>`
 * with an accessible name and its headings, in source order, always mounted.
 */

/** Fraction of a panel that must show for the rail to call its chapter active. */
const ACTIVE_THRESHOLD = 0.55;

/**
 * The viewport is roomy enough for a whole chapter to be one screen. Must stay
 * identical to the `reel` custom variant in index.css — the layout is CSS's
 * decision and this is only how the measuring code asks which way it went.
 * ReelStage.test.tsx compares the two strings.
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

interface RegisteredChapter {
  id: string;
  label: string;
  el: HTMLElement;
}

interface RegisteredPanel {
  chapterId: string;
  el: HTMLElement;
}

interface StageApi {
  registerChapter: (chapter: RegisteredChapter) => () => void;
  registerPanel: (panel: RegisteredPanel) => () => void;
  scrollToChapter: (id: string) => void;
  chapters: Array<{ id: string; label: string }>;
  activeId: string | null;
  /** Chapter ids with a panel on screen — what pauses the hero video. */
  visibleIds: readonly string[];
  snapMode: SnapMode;
}

const StageContext = createContext<StageApi | null>(null);
const ChapterContext = createContext<{ id: string; visible: boolean } | null>(
  null,
);

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
 * it to stop playing once its chapter is scrolled away, reading the stage's
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
}: {
  /** Accessible name for the progress rail, e.g. "Chapters". */
  label: string;
  children: ReactNode;
}) {
  const [chapters, setChapters] = useState<RegisteredChapter[]>([]);
  const [panels, setPanels] = useState<RegisteredPanel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<readonly string[]>([]);
  const [snapMode, setSnapMode] = useState<SnapMode>("off");
  // Ratios live in a ref: the observer reports only the panels that crossed the
  // threshold, so picking the active chapter needs the last reading for the rest.
  const ratios = useRef(new Map<HTMLElement, number>());

  const registerChapter = useCallback((chapter: RegisteredChapter) => {
    setChapters((prev) =>
      [...prev.filter((c) => c.el !== chapter.el), chapter].sort(
        byDocumentPosition,
      ),
    );
    return () => setChapters((prev) => prev.filter((c) => c.el !== chapter.el));
  }, []);

  const registerPanel = useCallback((panel: RegisteredPanel) => {
    setPanels((prev) =>
      [...prev.filter((p) => p.el !== panel.el), panel].sort(
        byDocumentPosition,
      ),
    );
    return () =>
      setPanels((prev) => {
        ratios.current.delete(panel.el);
        return prev.filter((p) => p.el !== panel.el);
      });
  }, []);

  // ── Snap strength ─────────────────────────────────────────────────────────
  // Measured, not guessed: which targets overflow depends on the language, the
  // font, the window and whether CSS laid the chapter out as one screen or as a
  // stack of panels.
  useEffect(() => {
    const measure = () => {
      if (mediaMatches(REDUCE_QUERY)) {
        setSnapMode("off");
        return;
      }
      const wide = mediaMatches(REEL_LAYOUT_QUERY);
      const targets = wide ? chapters : panels;
      if (targets.length === 0) {
        setSnapMode("off");
        return;
      }
      const band = window.innerHeight - navHeight();
      const fits = targets.every((t) => t.el.offsetHeight <= band + 2);
      setSnapMode(fits ? "mandatory" : "proximity");
    };

    measure();
    const stopReduce = watchMedia(REDUCE_QUERY, measure);
    const stopLayout = watchMedia(REEL_LAYOUT_QUERY, measure);
    window.addEventListener("resize", measure);
    // Content reflows without a resize too — a language switch, a font landing,
    // an image finally sizing itself.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    for (const target of [...chapters, ...panels]) observer?.observe(target.el);
    return () => {
      stopReduce();
      stopLayout();
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [chapters, panels]);

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

  // ── Which chapter the rail should light ───────────────────────────────────
  useEffect(() => {
    if (panels.length === 0) {
      setActiveId(chapters[0]?.id ?? null);
      setVisibleIds(chapters.map((c) => c.id));
      return;
    }
    // No observer (jsdom, ancient browsers): call the first chapter active and
    // every chapter visible rather than leaving the rail unlit and the video
    // paused for good.
    if (typeof IntersectionObserver === "undefined") {
      setActiveId(panels[0].chapterId);
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
        const showing = new Set<string>();
        let best: string | null = null;
        let bestRatio = 0;
        for (const panel of panels) {
          const ratio = ratios.current.get(panel.el) ?? 0;
          if (ratio > 0) showing.add(panel.chapterId);
          if (ratio > bestRatio) {
            best = panel.chapterId;
            bestRatio = ratio;
          }
        }
        setVisibleIds(Array.from(showing));
        if (best) setActiveId(best);
      },
      { threshold: ACTIVE_THRESHOLD },
    );
    for (const panel of panels) observer.observe(panel.el);
    return () => observer.disconnect();
  }, [panels, chapters]);

  const scrollToChapter = useCallback(
    (id: string) => {
      const chapter = chapters.find((c) => c.id === id);
      if (!chapter) return;
      // scrollIntoView is deliberately not used: it picks its own alignment and
      // walks every scrollable ancestor, which on a snapping scroller fights the
      // snap points and can leave the page mid-panel.
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
      registerPanel,
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
      registerPanel,
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
  layout = "",
  children,
}: {
  /** Rail label and the section's accessible name. */
  label: string;
  /** Stable id — also the fragment target (`/#product`). */
  id: string;
  /** The chapter's background band, e.g. `bg-[var(--brand-ink)]`. */
  className?: string;
  /**
   * How the chapter's panels lay out once the viewport is roomy enough for the
   * chapter to be one screen — grid classes under the `reel:` variant, e.g.
   * `reel:grid-cols-2 reel:items-center`. Ignored below that size, where each
   * panel is a screen of its own.
   */
  layout?: string;
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
  const chapterValue = useMemo(() => ({ id, visible }), [id, visible]);

  return (
    <ChapterContext.Provider value={chapterValue}>
      {/* `grid`, never `flex`: index.css carries an unlayered
          `.flex { min-height: 0 }` fix that beats every utility in
          @layer utilities, so a flex chapter loses its min-height and the reel
          silently becomes the long page it replaces. */}
      <section
        ref={ref}
        id={id}
        data-reel-chapter={id}
        aria-label={label}
        className={`grid ${className} reel:min-h-[calc(100svh_-_var(--nav-height))] reel:snap-start reel:content-center reel:py-5 ${layout}`}
      >
        {children}
      </section>
    </ChapterContext.Provider>
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
  const stage = useContext(StageContext);
  const chapter = useContext(ChapterContext);
  const ref = useRef<HTMLDivElement>(null);
  const registerPanel = stage?.registerPanel;
  const chapterId = chapter?.id;

  useEffect(() => {
    const el = ref.current;
    if (!el || !registerPanel || !chapterId) return;
    return registerPanel({ chapterId, el });
  }, [registerPanel, chapterId]);

  return (
    <div
      ref={ref}
      data-reel-panel={chapterId ?? ""}
      // svh, not dvh: dvh changes as a mobile address bar collapses, which
      // would resize the panel you are mid-swipe through. svh is the
      // small-address-bar height, so a panel that fits always fits.
      //
      // The min-height is a utility rather than an inline style on purpose —
      // `reel:min-h-0` has to be able to win, and nothing overrides inline.
      className={`grid min-h-[calc(100svh_-_var(--nav-height))] snap-start content-center py-10 ${className} reel:min-h-0 reel:snap-align-none reel:py-0`}
    >
      {children}
    </div>
  );
}
