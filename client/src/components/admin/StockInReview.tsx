/**
 * StockInReview — the approval gate between a merchant's spreadsheet and their
 * catalogue.
 *
 * Renders the diff `stockIn.preview` returns and, on approval, passes back the
 * fingerprint it came with. That round trip is the safety property: if the
 * merchant typed anything else into the tab in the meantime, the server refuses
 * the apply and this asks for a fresh review rather than writing rows nobody
 * looked at.
 *
 * Two things the layout is deliberate about:
 *
 *  - **The change is shown as before → after, with the delta beside it.** An
 *    admin approving "+2" needs to see that it lands on 5, not on 2 — the whole
 *    reason this column is a delta is that the two numbers differ.
 *  - **Rejected rows are shown, not hidden.** A row with an unknown id or an
 *    unparseable number stays in the merchant's sheet, so the person approving
 *    is the only one who can tell them it is there.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, ClipboardList } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  SettingsCard,
} from "@/components/admin/ui";

type PreviewRow = ReturnType<
  typeof trpc.stockIn.preview.useMutation
>["data"] extends { rows: (infer R)[] } | undefined
  ? R
  : never;

/** Statuses that are set aside rather than applied. */
const REJECTED = new Set(["unknown_product", "invalid_delta", "invalid_price"]);

export default function StockInReview() {
  const { t } = useTranslation("admin");
  const [hash, setHash] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [reviewed, setReviewed] = useState(false);

  const preview = trpc.stockIn.preview.useMutation({
    onSuccess: (data) => {
      setRows(data.rows as PreviewRow[]);
      setHash(data.hash);
      setReviewed(true);
    },
    onError: (e) => toast.error(e.message || t("ops.stockIn.previewError")),
  });

  const apply = trpc.stockIn.applyChanges.useMutation({
    onSuccess: (result) => {
      toast.success(
        t("ops.stockIn.appliedToast", { count: result.applied.length }),
      );
      // Replace the diff with whatever is still outstanding, so the card shows
      // the rows the merchant must fix rather than a stale approved list.
      setRows(result.remaining as PreviewRow[]);
      setHash(null);
    },
    onError: (e) => {
      // A conflict is not an error the admin did anything wrong — the sheet
      // moved. Drop the stale fingerprint so the only route forward is a fresh
      // review.
      setHash(null);
      toast.error(e.message || t("ops.stockIn.applyError"));
    },
  });

  const applicable = rows.filter((r) => r.status === "ok");
  const rejected = rows.filter((r) => REJECTED.has(r.status));
  const unchanged = rows.filter((r) => r.status === "no_change");

  return (
    <SettingsCard
      title={t("ops.stockIn.title")}
      description={t("ops.stockIn.description")}
      footer={
        <>
          <SecondaryButton
            onClick={() => preview.mutate()}
            loading={preview.isPending}
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {t("ops.stockIn.reviewAction")}
          </SecondaryButton>
          <PrimaryButton
            onClick={() => hash && apply.mutate({ hash })}
            loading={apply.isPending}
            disabled={!hash || applicable.length === 0}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {t("ops.stockIn.applyAction", { count: applicable.length })}
          </PrimaryButton>
        </>
      }
    >
      {!reviewed && (
        <p className="text-sm text-muted-foreground">
          {t("ops.stockIn.idleHint")}
        </p>
      )}

      {reviewed && rows.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
          title={t("ops.stockIn.emptyTitle")}
          description={t("ops.stockIn.emptyBody")}
        />
      )}

      {applicable.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">
                  {t("ops.stockIn.colRow")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("ops.stockIn.colItem")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("ops.stockIn.colStock")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("ops.stockIn.colPrice")}
                </th>
                <th className="py-2 font-medium">{t("ops.stockIn.colNote")}</th>
              </tr>
            </thead>
            <tbody>
              {applicable.map((row) => (
                <tr key={row.rowNumber} className="border-b last:border-0">
                  {/* lining-nums throughout: the admin serif defaults to
                      oldstyle figures, which renders a quantity of 0 as a glyph
                      that reads as the letter o. */}
                  <td className="py-2 pr-4 text-muted-foreground lining-nums">
                    {row.rowNumber}
                  </td>
                  <td className="py-2 pr-4 text-foreground">
                    {row.itemName}
                    <span className="ml-1.5 text-xs text-muted-foreground lining-nums">
                      #{row.productId}
                    </span>
                  </td>
                  <td className="py-2 pr-4 lining-nums">
                    {row.quantityDelta === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-muted-foreground">
                          {row.quantityBefore}
                        </span>
                        <ArrowRight
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">
                          {row.quantityAfter}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({row.quantityDelta > 0 ? "+" : ""}
                          {row.quantityDelta})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 lining-nums">
                    {row.newPrice === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-muted-foreground">
                          {row.priceBefore}
                        </span>
                        <ArrowRight
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">
                          {row.newPrice}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {row.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("ops.stockIn.rejectedTitle", { count: rejected.length })}
          </p>
          <ul className="mt-2 space-y-1">
            {rejected.map((row) => (
              <li key={row.rowNumber} className="lining-nums">
                {t("ops.stockIn.rejectedRow", {
                  row: row.rowNumber,
                  reason: row.message ?? row.status,
                })}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">{t("ops.stockIn.rejectedHint")}</p>
        </div>
      )}

      {unchanged.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground lining-nums">
          {t("ops.stockIn.unchangedNote", { count: unchanged.length })}
        </p>
      )}
    </SettingsCard>
  );
}
