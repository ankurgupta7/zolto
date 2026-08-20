import { Link } from "wouter";
import { AI_NATIVE_PITCH, PLATFORM } from "@shared/platform";
import { SketchUnderline } from "@/components/SketchAccents";
import { Container } from "../components/Container";
import { AgentProofBand, HowAnAiBuys } from "../components/AgentPitch";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * /why-gwinn — the AI-native argument, in full.
 *
 * These three pieces were all on the homepage: the proof band (a real MCP
 * purchase, staged), the found → asked → bought mechanics, and the end-of-day
 * reconciliation email. The homepage became a six-chapter reel, and a chapter
 * is one viewport; keeping all three would have meant shrinking them past the
 * point where the chat mock and the email are readable, which is the one thing
 * they exist to be. So they moved here, in the same order, with the same copy
 * and the same locale keys, and the reel's "what's coming" chapter links to
 * this page.
 *
 * What stayed on the homepage is the thesis band itself — the strongest of the
 * three, and the only one that argues rather than demonstrates. This page opens
 * by restating it, because a visitor arriving from a search result hasn't read
 * the homepage.
 */
export default function WhyPlatform() {
  const { t, st } = useMarketingT();

  useDocumentMeta({
    title: t("whyPlatform.metaTitle", { name: PLATFORM.name }),
    description: t("whyPlatform.metaDescription", { name: PLATFORM.name }),
    path: "/why-gwinn",
  });

  return (
    <>
      <Container className="grid gap-10 pb-6 pt-20 md:grid-cols-2 md:items-center">
        <div>
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {st("aiNativePitch.eyebrow", AI_NATIVE_PITCH.eyebrow)}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.1] text-[var(--brand-text)] sm:text-5xl">
            {st("aiNativePitch.headline", AI_NATIVE_PITCH.headline)}{" "}
            {/* Only the punchline is underlined, so the stroke stays tight to
                the words however the heading wraps. */}
            <span className="relative inline-block">
              {st(
                "aiNativePitch.headlineEmphasis",
                AI_NATIVE_PITCH.headlineEmphasis,
              )}
              <span
                aria-hidden
                className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
              >
                <SketchUnderline />
              </span>
            </span>
          </h1>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-[var(--brand-muted-2)]">
            {st("aiNativePitch.body", AI_NATIVE_PITCH.body)}
          </p>
        </div>

        {/* End-of-day reconciliation email mock — the back office doing itself,
            which is the same claim the rest of this page makes about the front
            of the shop. It came off the homepage with the two bands below. */}
        <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-[0_18px_44px_-30px_rgba(45,38,32,0.5)]">
          <div className="border-b border-[var(--brand-border)] px-5 py-3.5 text-[13px] text-[var(--brand-muted)]">
            {t("landing.emailFrom")}{" "}
            <span className="text-[var(--brand-text)]">Gwinn</span> ·{" "}
            {t("landing.emailSubjectLabel")}{" "}
            <span className="text-[var(--brand-text)]">
              {t("landing.emailSubject")}
            </span>
          </div>
          <div className="px-5 py-5">
            <p className="mb-4 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
              {t("landing.emailBody")}
            </p>
            {[
              {
                name: t("landing.emailItem1Name"),
                meta: t("landing.emailItem1Meta"),
              },
              {
                name: t("landing.emailItem2Name"),
                meta: t("landing.emailItem2Meta"),
              },
            ].map((g) => (
              <div
                key={g.name}
                className="mb-2.5 flex items-center gap-3 rounded-lg border border-[var(--brand-border)] px-3.5 py-3"
              >
                <span
                  aria-hidden
                  className="h-10 w-10 flex-none rounded-md bg-gradient-to-br from-[#d9c9a3] to-[var(--brand-accent)]"
                />
                <span className="min-w-0">
                  <span className="block font-serif text-[15px] text-[var(--brand-text)]">
                    {g.name}
                  </span>
                  <span className="text-[13px] text-[var(--brand-muted)]">
                    {g.meta}
                  </span>
                </span>
                <span className="ml-auto rounded-md bg-[var(--brand-accent)] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-accent-fg)]">
                  {t("landing.emailConfirm")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Container>

      <AgentProofBand />
      <HowAnAiBuys />

      <Container width="4xl" className="py-16 text-center">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("landing.startFree")}
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-[var(--brand-ink)]/25 px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            {t("landing.seePricing")}
          </Link>
        </div>
      </Container>
    </>
  );
}
