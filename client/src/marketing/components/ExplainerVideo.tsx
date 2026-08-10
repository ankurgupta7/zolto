import { useCallback, useEffect, useRef, useState } from "react";
import { useMarketingT } from "../lib/marketingI18n";
import { useReelChapterVisible } from "./ReelStage";

/**
 * ExplainerVideo — the Zolto explainer, in the hero beside the promise.
 *
 * It behaves the way a reader expects a hero video to behave rather than the
 * way an autoplaying advert does: it loops silently while you are reading the
 * chapter it belongs to, it stops the moment you scroll past it, and one click
 * turns it into an ordinary video with sound and controls that the reader is
 * then in charge of. Under `prefers-reduced-motion: reduce` nothing moves until
 * they ask — the poster frame and the play button are the whole thing.
 *
 * The poster is painted as the frame's background as well as being handed to
 * the `<video>`: a poster attribute only shows while the media element is
 * happy, so a video that fails to load would otherwise leave a black box where
 * the product should be.
 *
 * Pausing off-screen reuses the reel's own IntersectionObserver (see
 * useReelChapterVisible) instead of starting a second one, and outside a reel
 * chapter it simply plays.
 */

/** Fallbacks, the same contract as `st()`: never render a raw locale key. */
const DEFAULT_CAPTION = "Two minutes, start to first sale.";
const DEFAULT_PLAY_LABEL = "Play the Zolto explainer";

function usePrefersReducedMotion(): boolean {
  const read = () =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  const [reduce, setReduce] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduce(mql.matches);
    onChange();
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener?.(onChange);
    return () => mql.removeListener?.(onChange);
  }, []);

  return reduce;
}

export function ExplainerVideo({
  src,
  poster,
  captionKey,
}: {
  /** Video file, e.g. "/video/zolto-explainer.mp4". */
  src: string;
  /** Poster frame. Shown until the video can play — and instead of it, if it can't. */
  poster: string;
  /** Marketing locale key for the caption line under the frame. */
  captionKey: string;
}) {
  const { t } = useMarketingT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = usePrefersReducedMotion();
  const visible = useReelChapterVisible();
  /** The reader has taken over: sound on, controls on, no silent loop. */
  const [engaged, setEngaged] = useState(false);

  // React writes `muted` as a property, so keep it in step imperatively too —
  // an unmute that only changed the attribute would leave a silent video.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = !engaged;
  }, [engaged]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Off screen: stop, whatever mode we're in. A video talking to nobody from
    // two chapters up is the worst version of this component.
    if (!visible) {
      video.pause?.();
      return;
    }
    // Engaged playback belongs to the reader and their controls.
    if (engaged) return;
    if (reduce) {
      video.pause?.();
      return;
    }
    try {
      // Autoplay can still be refused (a data-saver setting, a policy) — the
      // poster stays and the play button is still there, so nothing breaks.
      video.play?.()?.catch?.(() => {});
    } catch {
      /* jsdom and browsers without media support */
    }
  }, [visible, engaged, reduce]);

  const engage = useCallback(() => {
    setEngaged(true);
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    try {
      video.play?.()?.catch?.(() => {});
    } catch {
      /* as above */
    }
  }, []);

  return (
    <figure
      data-testid="explainer-video"
      // Capped in panels mode: a full-bleed 16/10 frame is 750px tall on a
      // 1280px laptop, which is a panel that cannot fit its own screen. In reel
      // mode the column already bounds it.
      className="m-0 mx-auto w-full max-w-xl reel:max-w-none"
    >
      <div
        // 16/9 on a short viewport, 16/10 where there is room: 20px of frame is
        // the difference between the hero being one screen on an iPhone SE and
        // scrolling inside itself.
        className="relative aspect-video overflow-hidden rounded-2xl border border-white/15 bg-[var(--brand-ink-deep)] bg-cover bg-center shadow-[0_28px_70px_-40px_rgba(0,0,0,0.8)] tall:aspect-[16/10]"
        style={{ backgroundImage: `url("${poster}")` }}
      >
        <video
          ref={videoRef}
          data-testid="explainer-video-el"
          src={src}
          poster={poster}
          muted
          loop={!engaged}
          controls={engaged}
          autoPlay={!reduce}
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
        {!engaged && (
          <button
            type="button"
            onClick={engage}
            aria-label={t("landing.video.play", {
              defaultValue: DEFAULT_PLAY_LABEL,
            })}
            className="group absolute inset-0 grid place-items-center bg-[var(--brand-ink)]/10 transition-colors hover:bg-[var(--brand-ink)]/0"
          >
            <span
              aria-hidden
              className="grid h-16 w-16 place-items-center rounded-full bg-[var(--brand-accent)] text-[var(--brand-ink)] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] transition-colors group-hover:bg-[var(--brand-accent-light)]"
            >
              <svg
                viewBox="0 0 24 24"
                className="ml-1 h-6 w-6"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 font-hand text-lg leading-snug text-[var(--brand-accent)] tall:mt-3 tall:text-xl">
        {t(captionKey, { defaultValue: DEFAULT_CAPTION })}
      </figcaption>
    </figure>
  );
}
