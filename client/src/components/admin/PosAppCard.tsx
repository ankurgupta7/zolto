/**
 * "Get the POS app" — the step that was missing from /admin/pos entirely.
 *
 * The register is a native app (android/ — `ch.zolto.pos`, and ios/), and the
 * admin explained how to connect Stripe and where to find the API key but
 * never said where to get the app itself, which is the first thing a merchant
 * standing at a market stall needs.
 *
 * Store links are read from build-time env because the app is built in CI and
 * is not published to either store yet (there is no listing URL to hard-code).
 * When a link is missing this says so plainly rather than rendering a dead
 * button — a merchant who taps a broken store link concludes the POS does not
 * exist. Pairing needs two things and both are shown here: the server address
 * to type in, and the store's POS API key (which lives on Keys & access, since
 * it is a credential and this page is not where secrets belong).
 */

import { Link } from "wouter";
import { Smartphone, Apple, KeyRound, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
// Ensure the shared i18n instance is initialized even when this card is
// rendered in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";

const ANDROID_URL = import.meta.env.VITE_POS_ANDROID_URL as string | undefined;
const IOS_URL = import.meta.env.VITE_POS_IOS_URL as string | undefined;

function StoreLink({
  href,
  icon: Icon,
  platform,
}: {
  href?: string;
  icon: typeof Smartphone;
  platform: string;
}) {
  const { t } = useTranslation("admin");
  if (!href) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("core.pos.notPublished", { platform })}
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t("core.pos.getFor", { platform })}
    </a>
  );
}

export function PosAppCard({ serverUrl }: { serverUrl: string }) {
  const { t } = useTranslation("admin");
  const [copied, setCopied] = useState(false);
  const unpublished = !ANDROID_URL && !IOS_URL;

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <StoreLink href={ANDROID_URL} icon={Smartphone} platform="Android" />
        <StoreLink href={IOS_URL} icon={Apple} platform="iPhone" />
      </div>

      {unpublished && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("core.pos.testingNote")}
        </p>
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
      </div>
    </div>
  );
}

export default PosAppCard;
