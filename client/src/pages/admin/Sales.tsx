/**
 * Sales (store plane) — the store's transaction ledger.
 *
 * Deliberately the dullest page in the admin: no model, no narrative, no
 * "generate". Just every paid transaction from both channels with the line
 * items that made it up, filterable and exportable. Insights sits next door and
 * answers "how is trading going"; this answers "what did I sell", which nothing
 * in the admin could answer before — and which stayed unanswerable when the AI
 * model was switched off.
 *
 * A row expands to its line items rather than opening a detail page, because
 * the question is nearly always about one sale seen in the context of the ones
 * around it (the customer standing at the stall, the day being cashed up).
 */
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
import {
  ChevronDown,
  Download,
  Receipt,
  Store,
  Globe,
  History,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  AdminOnly,
  PrimaryButton,
  SecondaryButton,
  inputClass,
} from "@/components/admin/ui";

type Channel = "all" | "pos" | "online";

interface LedgerItem {
  productId: number | null;
  name: string;
  amountMinor: number;
}

interface LedgerRow {
  key: string;
  id: number;
  channel: "pos" | "online";
  reference: string;
  createdAt: string;
  paymentMethod: string | null;
  currency: string;
  amountMinor: number;
  customerName: string | null;
  customerEmail: string | null;
  items: LedgerItem[];
}

function formatMoney(amountMinor: number, currency: string): string {
  return `${currency.toUpperCase()} ${(amountMinor / 100).toFixed(2)}`;
}

/** Swiss regional locale for the active UI language ("it" → "it-CH"). */
function dateLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

/**
 * One CSV cell. Everything is quoted and inner quotes doubled — item names are
 * merchant-entered text and routinely contain commas.
 */
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * The ledger as a spreadsheet: one line per ITEM, with the transaction's
 * reference repeated. A one-line-per-sale export would drop the very thing
 * this page exists to show.
 */
function buildCsv(rows: LedgerRow[]): string {
  const header = [
    "reference",
    "channel",
    "date",
    "payment_method",
    "customer",
    "item",
    "item_amount",
    "transaction_total",
    "currency",
  ];
  const lines = rows.flatMap((row) => {
    const base = [
      row.reference,
      row.channel,
      row.createdAt,
      row.paymentMethod ?? "",
      row.customerName ?? row.customerEmail ?? "",
    ];
    if (row.items.length === 0) {
      return [
        [
          ...base,
          "",
          "",
          (row.amountMinor / 100).toFixed(2),
          row.currency.toUpperCase(),
        ],
      ];
    }
    return row.items.map((item) => [
      ...base,
      item.name,
      item.amountMinor ? (item.amountMinor / 100).toFixed(2) : "",
      (row.amountMinor / 100).toFixed(2),
      row.currency.toUpperCase(),
    ]);
  });
  return [header, ...lines]
    .map((cells) => cells.map(csvCell).join(","))
    .join("\n");
}

export default function Sales() {
  const { t, i18n } = useTranslation("admin");
  const { user } = useAuth();
  const [channel, setChannel] = useState<Channel>("all");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recovery, setRecovery] = useState<RecoverySummary | null>(null);

  const query = trpc.sales.list.useQuery(
    {
      channel,
      paymentMethod: paymentMethod || undefined,
      search: search.trim() || undefined,
      from: from || undefined,
      // The input's `to` is exclusive, but a merchant picking a date means
      // "including that day" — so ask for the day after.
      to: to ? new Date(`${to}T00:00:00Z`).toISOString() : undefined,
    },
    { retry: false },
  );

  const utils = trpc.useUtils();
  // Reconstructs the line items of sales recorded before they were being
  // stored, from what their Stripe payments recorded (server/posBackfill.ts).
  // Previews first: `dryRun` stays true until the admin has read the report.
  const backfill = trpc.sales.backfillLineItems.useMutation({
    onSuccess: (summary) => {
      setRecovery(summary);
      if (!summary.dryRun) {
        utils.sales.list.invalidate();
        toast.success(t("ops.sales.recoverDone", { count: summary.restored }));
      }
    },
    onError: (e) => toast.error(e.message || t("ops.sales.recoverFailed")),
  });

  const rows = useMemo<LedgerRow[]>(() => query.data?.rows ?? [], [query.data]);
  const locale = dateLocale(i18n.language);

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const download = () => {
    const blob = new Blob([buildCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sales.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const totals = query.data?.totals;

  return (
    <div>
      <PageHeader
        title={t("ops.sales.title")}
        description={t("ops.sales.description")}
      />

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={t("ops.sales.statTransactions")}
            value={String(totals.count)}
          />
          <Stat
            label={t("ops.sales.statGross")}
            value={formatMoney(totals.grossMinor, "chf")}
          />
          <Stat
            label={t("ops.sales.statInPerson")}
            value={formatMoney(totals.posGrossMinor, "chf")}
            hint={t("ops.sales.statCount", { count: totals.posCount })}
          />
          <Stat
            label={t("ops.sales.statOnline")}
            value={formatMoney(totals.onlineGrossMinor, "chf")}
            hint={t("ops.sales.statCount", { count: totals.onlineCount })}
          />
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div
          className="inline-flex rounded-lg border bg-card p-1"
          role="group"
          aria-label={t("ops.sales.channelLabel")}
        >
          {(["all", "pos", "online"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setChannel(value)}
              aria-pressed={channel === value}
              className={`rounded-md px-3 py-1.5 text-sm ${
                channel === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`ops.sales.channel.${value}`)}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("ops.sales.filterMethod")}
          <select
            className={inputClass}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="">{t("ops.sales.filterMethodAll")}</option>
            {(query.data?.paymentMethods ?? []).map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("ops.sales.filterFrom")}
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("ops.sales.filterTo")}
          <input
            type="date"
            className={inputClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>

        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-auto sm:min-w-[12rem] sm:flex-1">
          {t("ops.sales.filterSearch")}
          <input
            type="search"
            className={inputClass}
            placeholder={t("ops.sales.filterSearchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <SecondaryButton onClick={download} disabled={rows.length === 0}>
          <Download className="h-4 w-4" />
          {t("ops.sales.export")}
        </SecondaryButton>
      </div>

      {/* Recover missing items. Shown when the ledger in view actually contains
          an unrepaired sale — so a store whose records are whole never sees it
          — and kept on screen once a run has reported, so the report survives
          the refetch that follows applying it. */}
      {(rows.some((r) => r.items.length === 0) || recovery !== null) && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("ops.sales.recoverTitle")}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {t("ops.sales.recoverDescription")}
              </p>
            </div>
            <SecondaryButton
              onClick={() => backfill.mutate({ dryRun: true })}
              loading={backfill.isPending}
            >
              <History className="h-4 w-4" />
              {recovery
                ? t("ops.sales.recoverRecheck")
                : t("ops.sales.recoverCheck")}
            </SecondaryButton>
          </div>
          {recovery && (
            <RecoveryReport
              summary={recovery}
              applying={backfill.isPending}
              onApply={() => backfill.mutate({ dryRun: false })}
            />
          )}
        </div>
      )}

      {query.data?.truncated && (
        <p className="mb-3 text-xs text-muted-foreground">
          {t("ops.sales.truncated", { shown: rows.length })}
        </p>
      )}

      {/* ── Ledger ──────────────────────────────────────────────────────── */}
      {query.isLoading ? (
        <LoadingState label={t("ops.sales.loading")} />
      ) : rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {/* On a phone the date folds into the reference cell — five
                      columns push the Total off-screen, and the total is the
                      one number that must never need a sideways scroll. */}
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    {t("ops.sales.thDate")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("ops.sales.thReference")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    {t("ops.sales.thMethod")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("ops.sales.thItems")}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t("ops.sales.thTotal")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOpen = expanded.has(row.key);
                  return (
                    <Fragment key={row.key}>
                      <tr className="border-b last:border-0 align-top">
                        <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground sm:table-cell">
                          {new Date(row.createdAt).toLocaleString(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {row.reference}
                          </div>
                          <div className="text-xs text-muted-foreground sm:hidden">
                            {new Date(row.createdAt).toLocaleString(locale, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {row.channel === "pos" ? (
                              <Store className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Globe className="h-3 w-3" aria-hidden="true" />
                            )}
                            {t(`ops.sales.channel.${row.channel}`)}
                          </div>
                          {(row.customerName || row.customerEmail) && (
                            <div className="text-xs text-muted-foreground">
                              {row.customerName || row.customerEmail}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 capitalize text-muted-foreground sm:table-cell">
                          {row.paymentMethod || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {row.items.length === 0 ? (
                            <span className="text-muted-foreground">
                              {t("ops.sales.noItems")}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggle(row.key)}
                              aria-expanded={isOpen}
                              className="flex items-start gap-1 text-left text-foreground hover:underline"
                            >
                              <ChevronDown
                                className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${
                                  isOpen ? "" : "-rotate-90"
                                }`}
                                aria-hidden="true"
                              />
                              <span>
                                {row.items.map((i) => i.name).join(", ")}
                              </span>
                            </button>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums lining-nums text-foreground">
                          {formatMoney(row.amountMinor, row.currency)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b">
                          <td colSpan={5} className="bg-muted/20 px-4 py-3">
                            {/* Indented and ruled so the breakdown reads as
                                belonging to the row above rather than as a
                                transaction of its own. */}
                            <ul className="space-y-1 border-l-2 border-border pl-3 sm:ml-6">
                              {row.items.map((item, index) => (
                                <li
                                  key={`${row.key}-${item.productId ?? "custom"}-${index}`}
                                  className="flex justify-between gap-4 text-sm"
                                >
                                  <span className="text-foreground">
                                    {item.name}
                                  </span>
                                  <span className="tabular-nums lining-nums text-muted-foreground">
                                    {item.amountMinor
                                      ? formatMoney(
                                          item.amountMinor,
                                          row.currency,
                                        )
                                      : t("ops.sales.itemAmountUnknown")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title={t("ops.sales.emptyTitle")}
          description={t("ops.sales.emptyDescription")}
          note={t("ops.sales.emptyNote")}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {/* lining-nums, or the serif face renders money in oldstyle figures. */}
      <p className="text-lg font-semibold tabular-nums lining-nums text-foreground">
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface RecoverySummary {
  scanned: number;
  withStripePayment: number;
  cashUnrecoverable: number;
  restored: number;
  lineItemsWritten: number;
  invoiceNumbersFilled: number;
  dryRun: boolean;
  skipped: Array<{
    posOrderId: number;
    totalChf: string;
    createdAt: string;
    names: string[];
    reason: string;
  }>;
}

/**
 * What the run found. The skipped list is as much the point as the recovered
 * count: for a sale whose per-item prices can't be established the names are
 * still known, and this is the only place they exist.
 */
function RecoveryReport({
  summary,
  onApply,
  applying,
}: {
  summary: RecoverySummary;
  onApply: () => void;
  applying: boolean;
}) {
  const { t } = useTranslation("admin");

  if (summary.scanned === 0) {
    return (
      <p className="mt-4 text-sm text-foreground">
        {t("ops.sales.recoverNothing")}
      </p>
    );
  }

  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t("ops.sales.recoverStatMissing")}
          value={String(summary.scanned)}
        />
        <Stat
          label={t("ops.sales.recoverStatRebuildable")}
          value={String(summary.restored)}
        />
        <Stat
          label={t("ops.sales.recoverStatCash")}
          value={String(summary.cashUnrecoverable)}
        />
        <Stat
          label={t("ops.sales.recoverStatReferences")}
          value={String(summary.invoiceNumbersFilled)}
        />
      </div>

      {summary.skipped.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            {t("ops.sales.recoverNotRebuilt")}
          </p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {summary.skipped.map((item) => (
              <li
                key={item.posOrderId}
                className="flex flex-wrap gap-x-2 text-xs"
              >
                <span className="text-foreground">KPOS-{item.posOrderId}</span>
                <span className="tabular-nums lining-nums text-muted-foreground">
                  CHF {item.totalChf}
                </span>
                {item.names.length > 0 && (
                  // The names survive even where the prices don't — for these
                  // sales this line is the only record of what was sold.
                  <span className="text-foreground">
                    {item.names.join(", ")}
                  </span>
                )}
                <span className="text-muted-foreground">— {item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.dryRun ? (
        <PrimaryButton
          onClick={onApply}
          loading={applying}
          disabled={
            summary.restored === 0 && summary.invoiceNumbersFilled === 0
          }
        >
          {t("ops.sales.recoverApply", { count: summary.restored })}
        </PrimaryButton>
      ) : (
        <p className="text-sm text-foreground">
          {t("ops.sales.recoverWritten", { count: summary.lineItemsWritten })}
        </p>
      )}
    </div>
  );
}
