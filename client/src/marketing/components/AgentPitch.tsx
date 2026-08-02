/**
 * The AI-native pitch — hero visual and the two bands beneath it.
 *
 * Copy lives in AI_NATIVE_PITCH (shared/platform.ts) so the landing page, the
 * llms/MCP briefs and the tests all read one source; these components are the
 * render only. The chat mock stages a purchase the product genuinely supports
 * (per-store MCP `create_checkout` — see server/mcp.ts), which is what lets
 * the proof band call itself "live today" rather than a concept reel.
 */

import { AI_NATIVE_PITCH } from "@shared/platform";
import { ScrollReveal } from "./ScrollReveal";

/**
 * Schematic two-curve chart: search declining, assistants rising. A claim
 * about direction, not data — no axis numbers on purpose (platform.test.ts
 * keeps the caption free of invented percentages).
 */
export function DiscoveryShiftChart() {
  const c = AI_NATIVE_PITCH.chart;
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        {c.title}
      </p>
      <svg
        viewBox="0 0 360 200"
        className="mt-4 w-full"
        role="img"
        aria-label={`${c.decliningLabel} declining, ${c.risingLabel} rising`}
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
          {c.decliningLabel}
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
          {c.risingLabel}
        </text>
        <text x="8" y="196" fill="rgba(255,255,255,0.35)" fontSize="11">
          {c.startYear}
        </text>
        <text x="330" y="196" fill="rgba(255,255,255,0.35)" fontSize="11">
          {c.endYear}
        </text>
      </svg>
      <p className="mt-4 text-sm leading-relaxed text-white/60">{c.caption}</p>
    </div>
  );
}

/**
 * A customer's assistant finding, checking, and buying a piece — the whole
 * pitch compressed into one conversation. The store, product, and price are
 * staged; the mechanism (llms.txt → MCP → checkout) is the shipped one.
 */
export function AgentChatMock() {
  return (
    <div
      data-testid="agent-chat-mock"
      className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--brand-border)] px-5 py-3">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="text-[13px] text-[var(--brand-muted)]">
          Your customer&rsquo;s AI assistant
        </span>
      </div>
      <div className="grid gap-3 px-5 py-5">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand-ink)] px-4 py-2.5 text-[14px] leading-relaxed text-white">
          Find me a handmade ceramic mug under CHF 40 that ships to Zürich by
          Friday.
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--brand-surface-2)] px-4 py-3 text-[14px] leading-relaxed text-[var(--brand-text)]">
          Bergblume Keramik, a small studio in Bern, has the{" "}
          <span className="font-medium">Alpine Glaze Mug</span> — hand-thrown,
          CHF 38, 3 in stock, ships tomorrow.
          <div className="mt-2.5 flex items-center gap-3 rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2.5">
            <span
              aria-hidden
              className="h-10 w-10 flex-none rounded-md bg-gradient-to-br from-[#d9c9a3] to-[var(--brand-accent)]"
            />
            <span className="min-w-0">
              <span className="block font-serif text-[15px]">
                Alpine Glaze Mug
              </span>
              <span className="text-[12px] text-[var(--brand-muted)] lining-nums tabular-nums">
                CHF 38 · 3 in stock · bergblume.zolto.ch
              </span>
            </span>
          </div>
          Want me to order it?
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand-ink)] px-4 py-2.5 text-[14px] text-white">
          Yes — order it.
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--brand-surface-2)] px-4 py-3 text-[14px] text-[var(--brand-text)]">
          <span className="font-medium text-emerald-700">Order placed ✓</span> —
          confirmation sent. Paid straight into the maker&rsquo;s Stripe.
        </div>
        <p className="mt-1 text-center font-mono text-[11px] tracking-tight text-[var(--brand-muted)]">
          live stock &amp; checkout via bergblume.zolto.ch/mcp
        </p>
      </div>
    </div>
  );
}

/** The proof band: the chat mock, framed as something you can go try. */
export function AgentProofBand() {
  const p = AI_NATIVE_PITCH.proof;
  return (
    <section className="bg-[var(--brand-ink-deep)]">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-[0.9fr_1.1fr]">
        <ScrollReveal>
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {p.eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-white sm:text-4xl">
            {p.headline}
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-white/70">
            {p.body}
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
  return (
    <section className="border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            no setup, no plugin, no agency
          </p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
            How an AI buys from you.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {AI_NATIVE_PITCH.steps.map((s, i) => (
            <ScrollReveal
              key={s.k}
              className="rounded-2xl border border-[var(--brand-border)] bg-white p-7 shadow-[0_18px_44px_-34px_rgba(45,38,32,0.5)]"
            >
              <p className="font-hand text-xl text-[var(--brand-accent)]">
                {i + 1}. {s.k}
              </p>
              <h3 className="mt-2 font-serif text-xl text-[var(--brand-text)]">
                {s.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                {s.body}
              </p>
            </ScrollReveal>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-[var(--brand-muted)]">
          {AI_NATIVE_PITCH.footnote}
        </p>
      </div>
    </section>
  );
}
