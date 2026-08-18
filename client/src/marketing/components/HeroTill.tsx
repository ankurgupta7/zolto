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
  const register = MAKER_PITCH.register;
  const title = st("makerPitch.register.title", register.title);

  return (
    <div
      data-testid="hero-till"
      className="rounded-2xl border border-band-fg/15 bg-band-fg/[0.04] p-7"
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-band-fg/45">
        {title}
      </p>
      {/* The payment row sits beside the handset rather than under it, so the
          card keeps a landscape shape next to a portrait phone — and, on a
          phone, so the whole card stays short enough that it doesn't push the
          hero's buttons a screen and a half down. The handset shrinks instead
          of the layout changing. */}
      <div className="mt-5 flex items-center justify-center gap-5 sm:gap-7">
        <SqueezePlayTill
          has={["grid", "twint"]}
          title={title}
          className="h-36 w-auto text-[var(--brand-accent-light)] sm:h-56"
        />
        <p className="font-serif text-lg leading-relaxed text-band-fg/80">
          {st("makerPitch.register.methods", register.methods)}
        </p>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-band-fg/60">
        {st("makerPitch.register.caption", register.caption)}
      </p>
    </div>
  );
}
