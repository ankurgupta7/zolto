/**
 * Orders (store plane) — paid online orders for this store, newest first
 * (checkout.listOrders). In-person sales are reconciled separately (see
 * Reconciliation); this page is the record of what sold through the storefront.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Receipt, Loader2 } from "lucide-react";
import { PageHeader, EmptyState, AdminOnly } from "@/components/admin/ui";

function formatMoney(amountMinor: number, currency: string): string {
  return `${currency.toUpperCase()} ${(amountMinor / 100).toFixed(2)}`;
}

export default function Orders() {
  const { user } = useAuth();
  const orders = trpc.checkout.listOrders.useQuery(undefined, { retry: false });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Paid orders from your online storefront."
      />

      {orders.isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : orders.data && orders.data.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    Items
                  </th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Method
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                    Date
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
                      {new Date(o.createdAt).toLocaleDateString()}
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
          title="No orders yet"
          description="When a customer checks out on your storefront, their order shows up here."
        />
      )}
    </div>
  );
}
