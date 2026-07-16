import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCart } from "@/contexts/CartContext";
import OrderReceipt from "@/components/OrderReceipt";

export default function CheckoutSuccess() {
  const { t } = useTranslation();
  const { clear } = useCart();

  const sessionId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("session_id") ?? "";
  }, []);

  // Poll the order status until the webhook marks it paid (TWINT can be async).
  const { data: order, isLoading } = trpc.checkout.orderStatus.useQuery(
    { sessionId },
    {
      enabled: Boolean(sessionId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "paid" || status === "failed" || status === "expired" ? false : 1000;
      },
    }
  );

  // Empty the bag once we land on the success page — payment has been initiated.
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear]);

  const paid = order?.status === "paid";

  return (
    <div className="page-enter pt-28 pb-24 min-h-[60vh]">
      <div className="container max-w-2xl text-center">
        {isLoading && !order ? (
          <Loader2 className="w-12 h-12 text-[#B8963E] animate-spin mx-auto mb-6" />
        ) : (
          <CheckCircle2 className="w-16 h-16 text-[#2D2620] mx-auto mb-6" />
        )}

        <h1 className="font-serif text-foreground text-3xl mb-3">
          {paid ? t("success.titlePaid") : t("success.titleProcessing")}
        </h1>
        <div className="divider-gold w-16 mx-auto mb-6" />

        <p className="text-muted-foreground text-sm font-sans leading-relaxed mb-2">
          {paid ? t("success.bodyPaid") : t("success.bodyProcessing")}
        </p>

        {order?.amountTotal != null && (
          <p className="font-serif text-2xl text-[#2D2620] my-6">
            CHF {(order.amountTotal / 100).toFixed(2)}
          </p>
        )}

        {order?.reference != null && (
          <p className="text-muted-foreground text-sm font-sans mb-2">
            {t("success.orderReference", { reference: String(order.reference).padStart(5, "0") })}
          </p>
        )}

        {order?.customerEmail && (
          <p className="text-muted-foreground text-sm font-sans mb-8">
            {t("success.confirmationEmail", { email: order.customerEmail })}
          </p>
        )}

        <div className="border-t border-[#E0D8CC] pt-6 mb-8 text-xs text-muted-foreground font-sans leading-relaxed">
          <p>{t("success.returnsNote")}</p>
        </div>

        <Link
          href="/shop"
          className="inline-flex bg-[#2D2620] text-[#B8963E] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[#3A3028] transition-colors"
        >
          {t("success.continueShopping")}
        </Link>

        {paid && order.items && order.items.length > 0 && (
          <OrderReceipt
            reference={order.reference}
            customerName={order.customerName}
            customerEmail={order.customerEmail}
            amountTotal={order.amountTotal}
            paymentMethod={order.paymentMethod}
            createdAt={order.createdAt}
            items={order.items}
          />
        )}
      </div>
    </div>
  );
}
