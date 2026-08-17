/**
 * Spreadsheet (store plane) — the merchant's Google Sheet mirror.
 *
 * Two lanes, and the page keeps them visibly separate because they carry very
 * different risk:
 *
 *  - **Out** (always): Sales and Inventory, republished from the ledger every
 *    hour and on demand. Read-only, protected in Google itself.
 *  - **In** (opt-in): a Stock In tab the merchant types restocks into, which an
 *    admin then reviews as a diff before anything is written.
 *
 * The copy leans on that asymmetry rather than hiding it. A merchant who
 * believes the spreadsheet *is* their inventory will eventually type an absolute
 * quantity over a sale that happened while the tab was open — so the page says,
 * in the merchant's own language, that the sheet publishes the books and the
 * Stock In tab proposes changes to them.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Sheet as SheetIcon,
  Unplug,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
import {
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SettingsCard,
  inputClass,
} from "@/components/admin/ui";
import StockInReview from "@/components/admin/StockInReview";

/**
 * Swiss regional locale for the active UI language ("it" → "it-CH"). A local
 * copy, matching Orders/Credits/Platform/ProductListItem — the bare language
 * tag gives "en" the US order, so a merchant reading English in Zurich would
 * see 8/17/2026 where every other admin page says 17.08.2026.
 */
function dateLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

/** "2026-08-17T08:00:00.000Z" → a readable local stamp, or a dash. */
function formatStamp(iso: string | null, language: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(dateLocale(language), {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export default function Sheets() {
  const { t, i18n } = useTranslation("admin");
  const status = trpc.sheets.status.useQuery(undefined, { retry: false });
  const [shareWith, setShareWith] = useState("");

  const refresh = () => status.refetch();

  const connect = trpc.sheets.connect.useMutation({
    onSuccess: () => {
      refresh();
      toast.success(t("ops.sheets.connectedToast"));
    },
    onError: (e) => toast.error(e.message || t("ops.sheets.connectError")),
  });

  const syncNow = trpc.sheets.syncNow.useMutation({
    onSuccess: (result) => {
      refresh();
      // A pending Stock In tab means the refresh deliberately left it alone.
      // Saying so is the difference between "nothing happened" and "your typing
      // is safe and still waiting for approval".
      toast.success(
        result.stockInPending
          ? t("ops.sheets.syncedStockInPending")
          : t("ops.sheets.syncedToast", { count: result.salesRows }),
      );
    },
    onError: (e) => toast.error(e.message || t("ops.sheets.syncError")),
  });

  const setStockIn = trpc.sheets.setStockIn.useMutation({
    onSuccess: (result) => {
      refresh();
      toast.success(
        result.stockInEnabled
          ? t("ops.sheets.stockInOnToast")
          : t("ops.sheets.stockInOffToast"),
      );
    },
    onError: (e) => toast.error(e.message || t("ops.sheets.stockInError")),
  });

  const disconnect = trpc.sheets.disconnect.useMutation({
    onSuccess: () => {
      refresh();
      toast.success(t("ops.sheets.disconnectedToast"));
    },
    onError: (e) => toast.error(e.message || t("ops.sheets.disconnectError")),
  });

  const header = (
    <PageHeader
      title={t("ops.sheets.title")}
      description={t("ops.sheets.description")}
    />
  );

  if (status.isLoading) {
    return (
      <div>
        {header}
        <LoadingState label={t("ops.sheets.loading")} />
      </div>
    );
  }

  // The feature is absent rather than broken on any installation without the
  // platform's Google credentials — every self-hosted one by default. Showing a
  // Connect button that cannot work would be worse than saying so.
  if (status.data && !status.data.configured) {
    return (
      <div>
        {header}
        <SettingsCard>
          <EmptyState
            icon={<SheetIcon className="h-6 w-6" aria-hidden="true" />}
            title={t("ops.sheets.unavailableTitle")}
            description={t("ops.sheets.unavailableBody")}
          />
        </SettingsCard>
      </div>
    );
  }

  const mirror = status.data?.mirror ?? null;

  if (!mirror) {
    // An admin who signed in with Google has already told us their Google
    // address, so there is nothing to ask: the card just says who it will be
    // shared with. Only Apple / magic-link sign-ins see a field, because Drive
    // can only share to a Google account and their address may not be one.
    const googleAccount = status.data?.googleAccount ?? null;
    return (
      <div>
        {header}
        <SettingsCard
          title={t("ops.sheets.connectTitle")}
          description={t("ops.sheets.connectBody")}
          footer={
            <PrimaryButton
              onClick={() =>
                connect.mutate(
                  googleAccount ? {} : { shareWith: shareWith.trim() },
                )
              }
              loading={connect.isPending}
              disabled={!googleAccount && !shareWith.trim()}
            >
              {t("ops.sheets.connectAction")}
            </PrimaryButton>
          }
        >
          {googleAccount ? (
            <p className="text-sm text-foreground">
              {t("ops.sheets.willShareWith")}{" "}
              {/* lining-nums: the admin serif defaults to oldstyle figures,
                  which turns a numeral in an address into a glyph that reads
                  as a letter. */}
              <span className="font-medium lining-nums">{googleAccount}</span>
            </p>
          ) : (
            <Field
              label={t("ops.sheets.shareWithLabel")}
              htmlFor="sheets-share-with"
              hint={t("ops.sheets.shareWithHint")}
            >
              <input
                id="sheets-share-with"
                type="email"
                className={inputClass}
                placeholder="you@gmail.com"
                value={shareWith}
                onChange={(e) => setShareWith(e.target.value)}
              />
            </Field>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {t("ops.sheets.directionNote")}
          </p>
        </SettingsCard>
      </div>
    );
  }

  return (
    <div>
      {header}

      <SettingsCard
        title={t("ops.sheets.yourSheetTitle")}
        description={t("ops.sheets.yourSheetBody")}
        footer={
          <>
            <SecondaryButton
              onClick={() => disconnect.mutate()}
              loading={disconnect.isPending}
            >
              <Unplug className="h-4 w-4" aria-hidden="true" />
              {t("ops.sheets.disconnectAction")}
            </SecondaryButton>
            <PrimaryButton
              onClick={() => syncNow.mutate()}
              loading={syncNow.isPending}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("ops.sheets.syncAction")}
            </PrimaryButton>
          </>
        }
      >
        <a
          href={mirror.spreadsheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("ops.sheets.openSheet")}
        </a>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("ops.sheets.sharedWith")}
            </dt>
            {/* lining-nums because Cormorant Garamond defaults to oldstyle
                figures, which turns a numeral in an address into a glyph that
                reads as a letter. */}
            <dd className="mt-1 text-sm text-foreground lining-nums">
              {mirror.sharedWith}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("ops.sheets.lastSynced")}
            </dt>
            <dd className="mt-1 text-sm text-foreground lining-nums">
              {formatStamp(mirror.lastSyncedAt, i18n.language)}
            </dd>
          </div>
        </dl>

        {mirror.lastSyncError && (
          <div className="mt-5 flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">{t("ops.sheets.syncFailedTitle")}</p>
              <p className="mt-0.5 break-words">{mirror.lastSyncError}</p>
              <p className="mt-1 text-xs">{t("ops.sheets.syncFailedHint")}</p>
            </div>
          </div>
        )}

        {/* Said before the button, not after: disconnecting takes the merchant's
            access away, and "download a copy first" is only useful advice while
            they still can. */}
        <p className="mt-5 text-xs text-muted-foreground">
          {t("ops.sheets.disconnectHint")}
        </p>
      </SettingsCard>

      <SettingsCard
        title={t("ops.sheets.stockInTitle")}
        description={t("ops.sheets.stockInBody")}
      >
        <label className="flex items-start gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={mirror.stockInEnabled}
            disabled={setStockIn.isPending}
            onChange={(e) => setStockIn.mutate({ enabled: e.target.checked })}
          />
          <span>
            {t("ops.sheets.stockInToggle")}
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("ops.sheets.stockInToggleHint")}
            </span>
          </span>
        </label>

        <p className="mt-4 text-xs text-muted-foreground">
          {t("ops.sheets.stockInDeltaNote")}
        </p>
      </SettingsCard>

      {mirror.stockInEnabled && <StockInReview />}
    </div>
  );
}
