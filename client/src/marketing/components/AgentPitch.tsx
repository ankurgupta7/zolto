/**
 * The AI-native pitch — the thesis band and the two bands beneath it.
 *
 * Copy lives in AI_NATIVE_PITCH (shared/platform.ts) so the landing page, the
 * llms/MCP briefs and the tests all read one source; these components are the
 * render only, translated through the marketing locale files with the shared
 * English strings as fallback. The chat mock stages a purchase the product
 * genuinely supports (per-store MCP `create_checkout` — see server/mcp.ts),
 * which is what lets the proof band call itself "live today" rather than a
 * concept reel.
 *
 * All three bands used to open the page, with the thesis as the `<h1>`. They
 * now sit below the product sections — see the doc comment on MAKER_PITCH for
 * why. The copy is unchanged; only its place in the argument moved.
 */

import { AI_NATIVE_PITCH } from "@shared/platform";
import { SketchUnderline } from "@/components/SketchAccents";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * Schematic two-curve chart: search declining, assistants rising. A claim
 * about direction, not data — no axis numbers on purpose (platform.test.ts
 * keeps the caption free of invented percentages).
 */
export function DiscoveryShiftChart() {
  const { st } = useMarketingT();
  const c = AI_NATIVE_PITCH.chart;
  const decliningLabel = st(
    "aiNativePitch.chart.decliningLabel",
    c.decliningLabel,
  );
  const risingLabel = st("aiNativePitch.chart.risingLabel", c.risingLabel);
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        {st("aiNativePitch.chart.title", c.title)}
      </p>
      <svg
        viewBox="0 0 360 200"
        className="mt-4 w-full"
        role="img"
        aria-label={`${decliningLabel} declining, ${risingLabel} rising`}
      >
        <line
          x1="8"
          y1="180"
          x2="352"
          y2="180"
          stroke="rgba(255,255,255,0.25)"
        />
        <path
          d="M8 40 C 120 48, 220 90, 352 150"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="2.5"
          strokeDasharray="6 5"
        />
        <text x="14" y="30" fill="rgba(255,255,255,0.45)" fontSize="12">
          {decliningLabel}
        </text>
        <path
          d="M8 168 C 140 160, 240 110, 352 34"
          fill="none"
          stroke="var(--brand-accent-light, #d4b45c)"
          strokeWidth="3"
        />
        <text
          x="235"
          y="60"
          fill="var(--brand-accent-light, #d4b45c)"
          fontSize="12"
          fontWeight="600"
        >
          {risingLabel}
        </text>
        <text x="8" y="196" fill="rgba(255,255,255,0.35)" fontSize="11">
          {c.startYear}
        </text>
        <text x="330" y="196" fill="rgba(255,255,255,0.35)" fontSize="11">
          {c.endYear}
        </text>
      </svg>
      <p className="mt-4 text-sm leading-relaxed text-white/60">
        {st("aiNativePitch.chart.caption", c.caption)}
      </p>
    </div>
  );
}

/**
 * A customer's assistant finding, checking, and buying a piece — the whole
 * pitch compressed into one conversation. The store, product, and price are
 * staged; the mechanism (llms.txt → MCP → checkout) is the shipped one.
 */
export function AgentChatMock() {
  const { t } = useMarketingT();
  return (
    <div
      data-testid="agent-chat-mock"
      className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--brand-border)] px-5 py-3">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="text-[13px] text-[var(--brand-muted)]">
          {t("agentPitch.assistantLabel")}
        </span>
      </div>
      <div className="grid gap-3 px-5 py-5">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand-ink)] px-4 py-2.5 text-[14px] leading-relaxed text-white">
          {t("agentPitch.chatUser1")}
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--brand-surface-2)] px-4 py-3 text-[14px] leading-relaxed text-[var(--brand-text)]">
          {t("agentPitch.chatAssistant1a")}{" "}
          <span className="font-medium">{t("agentPitch.chatProductName")}</span>{" "}
          {t("agentPitch.chatAssistant1b")}
          <div className="mt-2.5 flex items-center gap-3 rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2.5">
            <span
              aria-hidden
              className="h-10 w-10 flex-none rounded-md bg-gradient-to-br from-[#d9c9a3] to-[var(--brand-accent)]"
            />
            <span className="min-w-0">
              <span className="block font-serif text-[15px]">
                {t("agentPitch.chatProductName")}
              </span>
              <span className="text-[12px] text-[var(--brand-muted)] lining-nums tabular-nums">
                {t("agentPitch.chatProductMeta")}
              </span>
            </span>
          </div>
          {t("agentPitch.chatAssistant1c")}
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand-ink)] px-4 py-2.5 text-[14px] text-white">
          {t("agentPitch.chatUser2")}
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--brand-surface-2)] px-4 py-3 text-[14px] text-[var(--brand-text)]">
          <span className="font-medium text-emerald-700">
            {t("agentPitch.orderPlaced")}
          </span>{" "}
          {t("agentPitch.orderPlacedRest")}
        </div>
        <p className="mt-1 text-center font-mono text-[11px] tracking-tight text-[var(--brand-muted)]">
          {t("agentPitch.mcpCaption")}
        </p>
      </div>
    </div>
  );
}

/**
 * The thesis band: assistants are the new front door, with the chart beside it.
 *
 * This is the copy that was the hero. It keeps its eyebrow, headline and body
 * verbatim — what changed is that it's an `<h2>` on a page whose reader already
 * knows what a Zolto till is, so "your next customer is an AI" reads as a
 * reason to choose this shop rather than as a description of it.
 */
export function AiNativeBand({
  dense = false,
}: {
  /**
   * Rendered inside the homepage reel's "what's coming" chapter, beside the
   * market day (see components/ReelStage.tsx). The mahogany becomes a mahogany
   * *panel* on a light chapter — the same treatment ZeroCostPos gets in the
   * squeeze chapter — and the copy stacks above its chart instead of sitting
   * beside it, because half a chapter is not two columns wide.
   */
  dense?: boolean;
} = {}) {
  const { st } = useMarketingT();

  const copy = (
    <>
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {st("aiNativePitch.eyebrow", AI_NATIVE_PITCH.eyebrow)}
      </p>
      <h2 className="mt-3 max-w-xl font-serif text-3xl leading-[1.15] text-white sm:text-4xl">
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
      </h2>
      <p
        className={`max-w-md leading-relaxed text-white/70 ${
          dense ? "mt-5" : "mt-8"
        }`}
      >
        {st("aiNativePitch.body", AI_NATIVE_PITCH.body)}
      </p>
    </>
  );

  if (dense) {
    return (
      <div
        data-testid="ai-native-band"
        className="rounded-2xl bg-[var(--brand-ink)] p-7"
      >
        {copy}
        <div className="mt-6">
          <DiscoveryShiftChart />
        </div>
      </div>
    );
  }

  return (
    <section className="bg-[var(--brand-ink)]" data-testid="ai-native-band">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
        <ScrollReveal>{copy}</ScrollReveal>
        <ScrollReveal>
          <DiscoveryShiftChart />
        </ScrollReveal>
      </div>
    </section>
  );
}

/** The proof band: the chat mock, framed as something you can go try. */
export function AgentProofBand() {
  const { st } = useMarketingT();
  const p = AI_NATIVE_PITCH.proof;
  return (
    <section className="bg-[var(--brand-ink-deep)]">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-[0.9fr_1.1fr]">
        <ScrollReveal>
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {st("aiNativePitch.proof.eyebrow", p.eyebrow)}
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-white sm:text-4xl">
            {st("aiNativePitch.proof.headline", p.headline)}
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-white/70">
            {st("aiNativePitch.proof.body", p.body)}
          </p>
          <a
            href="/llms.txt"
            className="mt-6 inline-block font-mono text-[13px] text-[var(--brand-accent-light)] underline decoration-[var(--brand-accent)]/40 underline-offset-4 hover:decoration-[var(--brand-accent)]"
          >
            zolto.ch/llms.txt →
          </a>
        </ScrollReveal>
        <ScrollReveal>
          <AgentChatMock />
        </ScrollReveal>
      </div>
    </section>
  );
}

/** Found → Asked → Bought — the mechanics, one card per step. */
export function HowAnAiBuys() {
  const { t, st } = useMarketingT();
  return (
    <section className="border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {t("agentPitch.howEyebrow")}
          </p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
            {t("agentPitch.howHeading")}
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {AI_NATIVE_PITCH.steps.map((s, i) => (
            <ScrollReveal
              key={s.k}
              className="rounded-2xl border border-[var(--brand-border)] bg-white p-7 shadow-[0_18px_44px_-34px_rgba(45,38,32,0.5)]"
            >
              <p className="font-hand text-xl text-[var(--brand-accent)]">
                {i + 1}. {st(`aiNativePitch.steps.${i}.k`, s.k)}
              </p>
              <h3 className="mt-2 font-serif text-xl text-[var(--brand-text)]">
                {st(`aiNativePitch.steps.${i}.title`, s.title)}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                {st(`aiNativePitch.steps.${i}.body`, s.body)}
              </p>
            </ScrollReveal>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-[var(--brand-muted)]">
          {st("aiNativePitch.footnote", AI_NATIVE_PITCH.footnote)}
        </p>
      </div>
    </section>
  );
}
