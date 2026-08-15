/**
 * Discounts (store plane) — minting codes and handing them out.
 *
 * The page is built around the two shapes a merchant actually runs, which are
 * the same feature at different scales:
 *
 *   - one code, unlimited uses ("WELCOME10 on the flyer")
 *   - a batch of single-use codes ("fifty for the Christmas market", or one for
 *     a friend)
 *
 * so the form is one set of terms plus "how many", rather than two features.
 *
 * Distribution is a copy button, deliberately. A code is only useful once it
 * reaches somebody, and the thing a merchant does with it is paste it into a
 * WhatsApp message, an Instagram caption or an email they were already writing.
 * The share link (`/shop?discount=…`) is the same code with the typing removed.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Copy, Link2, Loader2, TicketPercent, Trash2 } from "lucide-react";
import {
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SettingsCard,
  inputClass,
} from "@/components/admin/ui";
import { discountShareUrl } from "@shared/discounts";

/** Copy helper that degrades to a message rather than failing silently. */
async function copy(text: string, onDone: () => void, onFail: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    onDone();
  } catch {
    onFail();
  }
}

export default function Discounts() {
  const { t } = useTranslation("admin");
  const utils = trpc.useUtils();

  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("10");
  const [count, setCount] = useState("1");
  const [code, setCode] = useState("");
  const [prefix, setPrefix] = useState("");
  const [campaign, setCampaign] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");

  const list = trpc.discounts.list.useQuery();

  const create = trpc.discounts.create.useMutation({
    onSuccess: (result) => {
      utils.discounts.list.invalidate();
      setCode("");
      toast.success(
        t("store.discounts.createdToast", { count: result.codes.length }),
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.discounts.update.useMutation({
    onSuccess: () => utils.discounts.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.discounts.delete.useMutation({
    onSuccess: () => {
      utils.discounts.list.invalidate();
      toast.success(t("store.discounts.deletedToast"));
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      toast.error(t("store.discounts.invalidValue"));
      return;
    }
    if (kind === "percent" && numericValue > 100) {
      toast.error(t("store.discounts.percentTooHigh"));
      return;
    }
    create.mutate({
      kind,
      // A fixed amount is typed in francs and stored in Rappen — the unit every
      // other money figure on the platform uses.
      value:
        kind === "percent"
          ? Math.floor(numericValue)
          : Math.round(numericValue * 100),
      count: Math.max(1, Number(count) || 1),
      code: code.trim() || undefined,
      prefix: prefix.trim() || undefined,
      campaign: campaign.trim() || null,
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
      minSubtotalRappen: minSubtotal
        ? Math.round(Number(minSubtotal) * 100)
        : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
  };

  const rows = list.data ?? [];
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div>
      <PageHeader
        title={t("store.discounts.title")}
        description={t("store.discounts.description")}
      />

      <SettingsCard
        title={t("store.discounts.createTitle")}
        description={t("store.discounts.createDescription")}
      >
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("store.discounts.kind")} htmlFor="discount-kind">
              <select
                id="discount-kind"
                className={inputClass}
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as "percent" | "amount")
                }
              >
                <option value="percent">
                  {t("store.discounts.kindPercent")}
                </option>
                <option value="amount">
                  {t("store.discounts.kindAmount")}
                </option>
              </select>
            </Field>
            <Field
              label={
                kind === "percent"
                  ? t("store.discounts.valuePercent")
                  : t("store.discounts.valueAmount")
              }
              htmlFor="discount-value"
            >
              <input
                id="discount-value"
                type="number"
                min="1"
                step={kind === "percent" ? "1" : "0.05"}
                className={inputClass}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <Field
              label={t("store.discounts.count")}
              htmlFor="discount-count"
              hint={t("store.discounts.countHint")}
            >
              <input
                id="discount-count"
                type="number"
                min="1"
                max="500"
                className={inputClass}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {Number(count) > 1 ? (
              <Field
                label={t("store.discounts.prefix")}
                htmlFor="discount-prefix"
                hint={t("store.discounts.prefixHint")}
              >
                <input
                  id="discount-prefix"
                  className={inputClass}
                  placeholder="XMAS"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                />
              </Field>
            ) : (
              <Field
                label={t("store.discounts.code")}
                htmlFor="discount-code"
                hint={t("store.discounts.codeHint")}
              >
                <input
                  id="discount-code"
                  className={inputClass}
                  placeholder="WELCOME10"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
            )}
            <Field
              label={t("store.discounts.campaign")}
              htmlFor="discount-campaign"
              hint={t("store.discounts.campaignHint")}
            >
              <input
                id="discount-campaign"
                className={inputClass}
                placeholder={t("store.discounts.campaignPlaceholder")}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={t("store.discounts.maxRedemptions")}
              htmlFor="discount-max"
              hint={t("store.discounts.maxRedemptionsHint")}
            >
              <input
                id="discount-max"
                type="number"
                min="1"
                className={inputClass}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
              />
            </Field>
            <Field
              label={t("store.discounts.minSubtotal")}
              htmlFor="discount-min"
              hint={t("store.discounts.minSubtotalHint")}
            >
              <input
                id="discount-min"
                type="number"
                min="0"
                step="1"
                className={inputClass}
                value={minSubtotal}
                onChange={(e) => setMinSubtotal(e.target.value)}
              />
            </Field>
            <Field
              label={t("store.discounts.expiresAt")}
              htmlFor="discount-expires"
              hint={t("store.discounts.expiresAtHint")}
            >
              <input
                id="discount-expires"
                type="date"
                className={inputClass}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <PrimaryButton type="submit" loading={create.isPending}>
              <TicketPercent className="h-4 w-4" aria-hidden="true" />
              {t("store.discounts.create")}
            </PrimaryButton>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        title={t("store.discounts.listTitle")}
        description={t("store.discounts.listDescription")}
      >
        {list.isLoading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<TicketPercent className="h-8 w-8" aria-hidden="true" />}
            title={t("store.discounts.emptyTitle")}
            description={t("store.discounts.emptyDescription")}
            note={t("store.discounts.emptyNote")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">
                    {t("store.discounts.colCode")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("store.discounts.colTerms")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("store.discounts.colUsed")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("store.discounts.colExpires")}
                  </th>
                  {/* Named for screen readers, blank on screen — the actions
                      column is icon buttons, and a visible header over them
                      reads as clutter. */}
                  <th className="py-2 font-medium text-right">
                    <span className="sr-only">
                      {t("store.discounts.colActions")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className={row.active ? "" : "opacity-50"}>
                    <td className="py-3 pr-4">
                      <span className="font-mono text-foreground">
                        {row.code}
                      </span>
                      {row.campaign && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.campaign}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {row.description}
                    </td>
                    {/* tabular-nums so "3 / 50" lines up down the column. */}
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                      {row.maxRedemptions
                        ? `${row.redeemedCount} / ${row.maxRedemptions}`
                        : row.redeemedCount}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                      {row.expiresAt
                        ? new Date(row.expiresAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label={t("store.discounts.copyCodeLabel", {
                            code: row.code,
                          })}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() =>
                            copy(
                              row.code,
                              () =>
                                toast.success(t("store.discounts.copiedCode")),
                              () =>
                                toast.error(t("store.discounts.copyFailed")),
                            )
                          }
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("store.discounts.copyLinkLabel", {
                            code: row.code,
                          })}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() =>
                            copy(
                              discountShareUrl(origin, row.code),
                              () =>
                                toast.success(t("store.discounts.copiedLink")),
                              () =>
                                toast.error(t("store.discounts.copyFailed")),
                            )
                          }
                        >
                          <Link2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={row.active}
                            aria-label={t("store.discounts.activeLabel", {
                              code: row.code,
                            })}
                            onChange={(e) =>
                              update.mutate({
                                id: row.id,
                                active: e.target.checked,
                              })
                            }
                          />
                          {t("store.discounts.active")}
                        </label>
                        <button
                          type="button"
                          aria-label={t("store.discounts.deleteLabel", {
                            code: row.code,
                          })}
                          className="rounded p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => remove.mutate({ id: row.id })}
                        >
                          {remove.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
