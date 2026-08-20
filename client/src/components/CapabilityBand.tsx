import { Store, Smartphone, Sparkles, LineChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
// Ensure the shared i18n instance is initialized even when this block is
// pulled in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import { SketchUnderline, SketchDivider } from "./SketchAccents";

/**
 * CapabilityBand — a slim, at-a-glance strip that answers the merchant's
 * question "is my shop set up and running?" rather than selling them the
 * product they already bought. It surfaces Gwinn's four pillars — Online Store,
 * Tap to Pay (POS), AI Studio, and Insights — each with a live status pill.
 *
 * This is a decorative/identity zone, so it carries the hand-drawn brand voice
 * (handwriting eyebrow, sketch underline + divider). Status pills stay crisp
 * and semantic: the merchant must trust them at a glance.
 */

export type CapabilityBandProps = {
  /** Whether this store's own Stripe account is linked (storefront is live). */
  storeConnected: boolean;
  /** Whether AI sales/inventory insights have already been generated. */
  insightsReady: boolean;
  /** Link the merchant to the Stripe Connect flow. */
  onConnectStore?: () => void;
  /** Jump to / generate the AI insights panel. */
  onViewInsights?: () => void;
};

type PillTone = "live" | "ready" | "todo";

type Pillar = {
  key: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  status: string;
  tone: PillTone;
  onAction?: () => void;
};

const PILL_TONE: Record<PillTone, string> = {
  // Semantic, kept separate from the gold brand accent.
  live: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ready:
    "bg-[var(--brand-surface)] text-[var(--brand-muted-2)] border-[var(--brand-border)]",
  todo: "bg-amber-50 text-amber-800 border-amber-200",
};

function StatusPill({ tone, children }: { tone: PillTone; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-[0.12em] ${PILL_TONE[tone]}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "live"
            ? "bg-emerald-500"
            : tone === "todo"
              ? "bg-amber-500"
              : "bg-[var(--brand-accent)]"
        }`}
      />
      {children}
    </span>
  );
}

export default function CapabilityBand({
  storeConnected,
  insightsReady,
  onConnectStore,
  onViewInsights,
}: CapabilityBandProps) {
  const { t } = useTranslation("admin");
  const pillars: Pillar[] = [
    {
      key: "store",
      icon: Store,
      title: t("catalog.components.capabilities.storeTitle"),
      blurb: t("catalog.components.capabilities.storeBlurb"),
      status: storeConnected
        ? t("catalog.components.capabilities.statusLive")
        : t("catalog.components.capabilities.statusConnect"),
      tone: storeConnected ? "live" : "todo",
      onAction: storeConnected ? undefined : onConnectStore,
    },
    {
      key: "pos",
      icon: Smartphone,
      title: t("catalog.components.capabilities.posTitle"),
      blurb: t("catalog.components.capabilities.posBlurb"),
      status: t("catalog.components.capabilities.statusReady"),
      tone: "ready",
    },
    {
      key: "ai",
      icon: Sparkles,
      title: t("catalog.components.capabilities.aiTitle"),
      blurb: t("catalog.components.capabilities.aiBlurb"),
      status: t("catalog.components.capabilities.statusActive"),
      tone: "ready",
    },
    {
      key: "insights",
      icon: LineChart,
      title: t("catalog.components.capabilities.insightsTitle"),
      blurb: t("catalog.components.capabilities.insightsBlurb"),
      status: insightsReady
        ? t("catalog.components.capabilities.statusReady")
        : t("catalog.components.capabilities.statusGenerate"),
      tone: insightsReady ? "ready" : "todo",
      onAction: insightsReady ? undefined : onViewInsights,
    },
  ];

  return (
    <section
      data-tour="capabilities"
      aria-label={t("catalog.components.capabilities.ariaLabel")}
      className="mb-8 bg-white border border-[var(--brand-border)]"
    >
      <div className="flex items-baseline justify-between gap-4 px-6 pt-5">
        <div>
          <p className="font-hand text-[var(--brand-accent)] leading-none">
            {t("catalog.components.capabilities.eyebrow")}
          </p>
          <div className="mt-1 w-40 text-[var(--brand-accent)]/70">
            <SketchUnderline />
          </div>
        </div>
        <p className="hidden sm:block text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-sans">
          {t("catalog.components.capabilities.tagline")}
        </p>
      </div>

      <div className="px-6 text-[var(--brand-accent)]/40">
        <SketchDivider />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {pillars.map((p, i) => {
          const Icon = p.icon;
          const Wrapper = p.onAction ? "button" : "div";
          return (
            <Wrapper
              key={p.key}
              {...(p.onAction
                ? { type: "button" as const, onClick: p.onAction }
                : {})}
              className={`group flex items-start gap-3 px-6 py-5 text-left border-t border-[var(--brand-border)] sm:border-t-0 ${
                i > 0 ? "lg:border-l lg:border-[var(--brand-border)]" : ""
              } ${
                i % 2 === 1
                  ? "sm:border-l sm:border-[var(--brand-border)] lg:border-l"
                  : ""
              } ${
                i >= 2
                  ? "sm:border-t sm:border-[var(--brand-border)] lg:border-t-0"
                  : ""
              } ${
                p.onAction
                  ? "transition-colors hover:bg-[var(--brand-surface-2)] cursor-pointer"
                  : ""
              }`}
            >
              <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                <Icon size={17} strokeWidth={1.5} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="font-serif text-foreground text-base leading-none">
                    {p.title}
                  </span>
                  <StatusPill tone={p.tone}>{p.status}</StatusPill>
                </span>
                <span className="mt-1.5 block text-xs font-sans text-muted-foreground leading-snug">
                  {p.blurb}
                </span>
              </span>
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}
