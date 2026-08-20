/**
 * /pos/pair?t=… — where a pairing link lands in a browser.
 *
 * The deep link the admin mints is `gwinn://pair?t=…`, which only resolves if the
 * app is installed. This page is the https fallback for the case that matters
 * most: the merchant taps the link on a phone that doesn't have the register app
 * yet. Without it, that tap does nothing at all and reads as a broken link.
 *
 * Deliberately unauthenticated: the merchant is opening this on the till phone,
 * which has never signed in to the admin. The token in the URL is what carries
 * the authority, and it is single-use and minutes-long (server/posPairing.ts).
 *
 * This page never redeems the token itself and never displays it — it only hands
 * it to the app. A token spent by this page would be a token the app can no
 * longer use.
 */

import { useEffect, useState } from "react";
import { Smartphone, Apple, ArrowRight, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import "@/lib/i18n";

/** Read the token from the URL without routing it through app state. */
function tokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("t")?.trim();
  return value ? value : null;
}

export default function PosPair() {
  const { t } = useTranslation("admin");
  const [token] = useState(tokenFromLocation);
  // Downloads are public build info, but the query sits behind auth, so a failure
  // here is expected on an unauthenticated till phone — hence no retry and a
  // graceful absence rather than an error.
  const downloads = trpc.tenant.posDownloads.useQuery(undefined, {
    retry: false,
  });

  const deepLink = token
    ? `gwinn://pair?t=${encodeURIComponent(token)}&url=${encodeURIComponent(window.location.origin)}`
    : null;

  useEffect(() => {
    // Try the app immediately: on a device that has it, pairing should feel like
    // one tap, not two. If nothing handles the scheme the browser simply stays
    // here, which is exactly the fallback this page exists to be.
    if (deepLink) window.location.href = deepLink;
  }, [deepLink]);

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("core.posPair.missingToken")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-foreground">
        {t("core.posPair.title")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("core.posPair.description")}
      </p>

      <a
        href={deepLink ?? undefined}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Smartphone className="h-4 w-4" />
        {t("core.posPair.openApp")}
        <ArrowRight className="h-4 w-4" />
      </a>

      <div className="mt-8 border-t pt-6">
        <p className="text-sm font-medium text-foreground">
          {t("core.posPair.noAppYet")}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {downloads.data?.android && (
            <a
              href={downloads.data.android.url}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Smartphone className="h-4 w-4" />
              {t("core.pos.getFor", { platform: "Android" })}
            </a>
          )}
          {downloads.data?.ios && (
            <a
              href={downloads.data.ios.url}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Apple className="h-4 w-4" />
              {t("core.pos.getFor", { platform: "iPhone" })}
            </a>
          )}
        </div>
        {/* The link expires in minutes, so a merchant who has to stop and install
            the app will need a fresh one — say that before they find out. */}
        <p className="mt-4 text-xs text-muted-foreground">
          {t("core.posPair.installThenNewLink")}
        </p>
      </div>
    </div>
  );
}
