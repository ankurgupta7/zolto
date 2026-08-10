/**
 * "Get the POS app" — the step that was missing from /admin/pos entirely.
 *
 * The register is a native app (android/ — `ch.zolto.pos`, and ios/), and the
 * admin explained how to connect Stripe and where to find the API key but
 * never said where to get the app itself, which is the first thing a merchant
 * standing at a market stall needs.
 *
 * Links come from the server (tenant.posDownloads → server/posDownloads.ts),
 * which resolves them to the rolling `pos-latest` release CI publishes on every
 * merge to main. They used to come from build-time env vars nothing ever set,
 * which is why this card only ever said "not published yet".
 *
 * Two things this is careful about:
 *
 *   - It never renders a dead button. A missing link says so plainly — a
 *     merchant who taps a broken store link concludes the POS does not exist.
 *   - It does not pretend the iOS build is an App Store install. That build is
 *     unsigned and has to be re-signed from a computer, so the card says so
 *     where the merchant will read it, not in a footnote.
 */

import { Link } from "wouter";
import { Smartphone, Apple, KeyRound, Copy, Check, Info } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
// Ensure the shared i18n instance is initialized even when this card is
// rendered in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";

/** "9.2 MB" — merchants pair over stall wifi, so the size is worth showing. */
function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / 1_000_000;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function formatBuiltAt(iso?: string, locale?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Download {
  url: string;
  requiresSideload: boolean;
  sizeBytes?: number;
  builtAt?: string;
  commit?: string;
}

function StoreLink({
  download,
  icon: Icon,
  platform,
  loading,
}: {
  download?: Download | null;
  icon: typeof Smartphone;
  platform: string;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation("admin");

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("core.pos.checking", { platform })}
      </div>
    );
  }

  // No URL at all: say so rather than rendering something that 404s.
  if (!download) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("core.pos.notPublished", { platform })}
      </div>
    );
  }

  const size = formatSize(download.sizeBytes);
  const built = formatBuiltAt(download.builtAt, i18n.language);
  // Which build a merchant is running is the first thing support needs.
  const stamp = [size, built, download.commit].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-1">
      <a
        href={download.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("core.pos.getFor", { platform })}
      </a>
      {stamp && (
        <span className="px-1 text-xs text-muted-foreground">{stamp}</span>
      )}
    </div>
  );
}

export function PosAppCard({ serverUrl }: { serverUrl: string }) {
  const { t } = useTranslation("admin");
  const [copied, setCopied] = useState(false);
  const downloads = trpc.tenant.posDownloads.useQuery(undefined, {
    retry: false,
    // The server caches for 15 minutes; re-asking on every mount buys nothing.
    staleTime: 5 * 60 * 1000,
  });

  const android = downloads.data?.android;
  const ios = downloads.data?.ios;
  const loading = downloads.isLoading;
  const nothingPublished = !loading && !android && !ios;
  // Only mention sideloading when a build that needs it is actually on offer.
  const showSideloadNote = Boolean(ios?.requiresSideload);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <StoreLink
          download={android}
          icon={Smartphone}
          platform="Android"
          loading={loading}
        />
        <StoreLink
          download={ios}
          icon={Apple}
          platform="iPhone"
          loading={loading}
        />
      </div>

      {nothingPublished && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("core.pos.testingNote")}
        </p>
      )}

      {showSideloadNote && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>{t("core.pos.iosSideloadNote")}</p>
        </div>
      )}

      <div className="mt-5 border-t pt-5">
        <p className="text-sm font-medium text-foreground">
          {t("core.pos.firstLaunch")}
        </p>
        <ol className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {t("core.pos.step1")}
            </span>
            <code className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">
              {serverUrl}
            </code>
            <button
              type="button"
              aria-label={t("core.pos.copyServer")}
              onClick={() => {
                navigator.clipboard?.writeText(serverUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {t("core.pos.step2")}
            </span>
            <Link
              href="/admin/account/keys"
              className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {/* Reuses the sidebar label — the link names that nav destination. */}
              {t("core.nav.keys-access")}
            </Link>
          </li>
        </ol>
        {/* Both steps above are skippable: the pairing link on Keys & access
            configures the app on tap, so this is the manual fallback. */}
        <p className="mt-3 text-xs text-muted-foreground">
          {t("core.pos.orPairInOneTap")}
        </p>
      </div>
    </div>
  );
}

export default PosAppCard;
