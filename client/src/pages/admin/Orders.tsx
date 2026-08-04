/**
 * Orders (store plane) — paid online orders for this store, newest first
 * (checkout.listOrders). In-person sales are reconciled separately (see
 * Reconciliation); this page is the record of what sold through the storefront.
 */
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
import { Receipt } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  AdminOnly,
} from "@/components/admin/ui";

function formatMoney(amountMinor: number, currency: string): string {
  return `${currency.toUpperCase()} ${(amountMinor / 100).toFixed(2)}`;
}

/** Swiss regional locale for the active UI language ("it" → "it-CH"). */
function dateLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

export default function Orders() {
  const { t, i18n } = useTranslation("admin");
  const { user } = useAuth();
  const orders = trpc.checkout.listOrders.useQuery(undefined, { retry: false });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const locale = dateLocale(i18n.language);

  return (
    <div>
      <PageHeader
        title={t("ops.orders.title")}
        description={t("ops.orders.description")}
      />

      {orders.isLoading ? (
        <LoadingState label={t("ops.orders.loading")} />
      ) : orders.data && orders.data.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">
                    {t("ops.orders.thOrder")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("ops.orders.thCustomer")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    {t("ops.orders.thItems")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    {t("ops.orders.thMethod")}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t("ops.orders.thTotal")}
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                    {t("ops.orders.thDate")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.data.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      #{o.id}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="text-foreground">
                        {o.customerName || "—"}
                      </div>
                      {o.customerEmail && (
                        <div className="text-xs text-muted-foreground">
                          {o.customerEmail}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {o.items.map((i) => i.name).join(", ")}
                    </td>
                    <td className="hidden px-4 py-3 capitalize text-muted-foreground md:table-cell">
                      {o.paymentMethod || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                      {formatMoney(o.amountTotal, o.currency)}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                      {new Date(o.createdAt).toLocaleDateString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title={t("ops.orders.emptyTitle")}
          description={t("ops.orders.emptyDescription")}
          note={t("ops.orders.emptyNote")}
        />
      )}
    </div>
  );
}
