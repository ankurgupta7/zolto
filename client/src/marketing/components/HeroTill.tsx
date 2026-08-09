import { MAKER_PITCH } from "@shared/platform";
import { SqueezePlayTill } from "./MarketingIllustrations";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * The hero's visual — the till, with a grid of wares in it.
 *
 * It replaced DiscoveryShiftChart in the hero slot for the same reason
 * MAKER_PITCH replaced AI_NATIVE_PITCH beside it: a two-curve chart of search
 * versus assistants is an argument, and the reader who has just arrived needs a
 * picture of the product first. The chart isn't gone — it moved down with the
 * thesis band it belongs to.
 *
 * The drawing is `SqueezePlayTill` with both halves present, which is
 * deliberate: the hero and the squeeze-play section are then showing literally
 * the same phone, so the section further down reads as the argument for a thing
 * the reader has already seen rather than as a new subject.
 */
export function HeroTill() {
  const { st } = useMarketingT();
  const till = MAKER_PITCH.till;
  const title = st("makerPitch.till.title", till.title);

  return (
    <div
      data-testid="hero-till"
      className="rounded-2xl border border-white/15 bg-white/[0.04] p-7"
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        {title}
      </p>
      <div className="mt-5 flex items-center justify-center gap-7">
        <SqueezePlayTill
          has={["grid", "twint"]}
          title={title}
          className="h-56 w-auto text-[var(--brand-accent-light)]"
        />
        {/* The payment row sits beside the handset rather than under it, so the
            card keeps a landscape shape next to a portrait phone. */}
        <p className="font-serif text-lg leading-relaxed text-white/80">
          {st("makerPitch.till.methods", till.methods)}
        </p>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-white/60">
        {st("makerPitch.till.caption", till.caption)}
      </p>
    </div>
  );
}
