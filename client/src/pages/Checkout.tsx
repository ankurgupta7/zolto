import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { formatPrice, useCurrency } from "@/lib/money";
import { Trash2, Lock, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useCart } from "@/contexts/CartContext";

/** TWINT wordmark-style badge (text fallback — avoids shipping the trademarked logo). */
const PaymentBadges = () => (
  <div className="flex items-center gap-2 flex-wrap">
    <span className="inline-flex items-center gap-1 text-[11px] font-sans uppercase tracking-wider bg-white border border-[var(--brand-border)] text-[var(--brand-ink)] px-2 py-1">
      <CreditCard size={12} /> Visa
    </span>
    <span className="text-[11px] font-sans uppercase tracking-wider bg-white border border-[var(--brand-border)] text-[var(--brand-ink)] px-2 py-1">
      Mastercard
    </span>
    <span className="text-[11px] font-sans uppercase tracking-wider bg-white border border-[var(--brand-border)] text-[var(--brand-ink)] px-2 py-1">
      Amex
    </span>
    <span className="text-[11px] font-sans uppercase tracking-wider bg-[#1A1A1A] text-white px-2 py-1">
      TWINT
    </span>
    <span className="text-[11px] font-sans uppercase tracking-wider bg-white border border-[var(--brand-border)] text-[var(--brand-ink)] px-2 py-1">
      Debit
    </span>
  </div>
);

export default function Checkout() {
  const { items, total, removeItem, clear } = useCart();
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const [, navigate] = useLocation();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: config } = trpc.checkout.config.useQuery();
  const createSession = trpc.checkout.createSession.useMutation();

  const displayName = (i: (typeof items)[number]) =>
    i18n.language === "en" && i.nameEn ? i.nameEn : i.name;

  const handlePay = async () => {
    if (!accepted) {
      toast.error(t("checkout.mustAccept"));
      return;
    }
    setSubmitting(true);
    try {
      const result = await createSession.mutateAsync({
        productIds: items.map((i) => i.id),
      });
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.error(t("checkout.error"));
        setSubmitting(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("checkout.error");
      toast.error(msg);
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="page-enter pt-28 pb-24 min-h-[60vh]">
        <div className="container max-w-2xl text-center">
          <div className="text-6xl text-[var(--brand-accent)]/20 font-serif mb-6">
            ◇
          </div>
          <h1 className="font-serif text-foreground text-2xl mb-3">
            {t("checkout.emptyTitle")}
          </h1>
          <p className="text-muted-foreground text-sm font-sans mb-8">
            {t("checkout.emptySub")}
          </p>
          <Link
            href="/shop"
            className="inline-flex bg-[var(--brand-ink)] text-[var(--brand-accent)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
          >
            {t("checkout.browseShop")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter pt-28 pb-24">
      <div className="container max-w-4xl">
        <h1 className="font-serif text-foreground text-3xl mb-2">
          {t("checkout.title")}
        </h1>
        <div className="divider-gold w-16 mb-10" />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* Order summary */}
          <div className="lg:col-span-3 space-y-5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 items-start border-b border-[var(--brand-border)] pb-5"
              >
                <div className="w-24 h-28 bg-[var(--brand-surface-3)] flex-shrink-0 overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={displayName(item)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl text-[var(--brand-accent)]/30 font-serif">
                      ◇
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-foreground text-lg leading-tight mb-1">
                    {displayName(item)}
                  </h3>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans mb-2">
                    {item.category}
                  </p>
                  <p className="font-serif text-[var(--brand-ink)] text-xl">
                    {formatPrice(Number(item.price), currency)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={t("cart.remove")}
                  className="text-muted-foreground hover:text-red-600 transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {/* Payment panel */}
          <div className="lg:col-span-2">
            <div className="bg-[var(--brand-surface)] border border-[var(--brand-border)] p-6 sticky top-28">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm uppercase tracking-[0.15em] font-sans text-muted-foreground">
                  {t("cart.subtotal")}
                </span>
                <span className="font-serif text-2xl text-[var(--brand-ink)]">
                  {formatPrice(total, currency)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-sans mb-5">
                {t("checkout.shippingNote")}
              </p>

              <div className="mb-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans mb-2">
                  {t("checkout.weAccept")}
                </p>
                <PaymentBadges />
              </div>

              <label className="flex items-start gap-2.5 mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--brand-ink)]"
                />
                <span className="text-xs text-muted-foreground font-sans leading-relaxed">
                  {t("checkout.acceptPrefix")}{" "}
                  <Link
                    href="/policy"
                    className="text-[var(--brand-ink)] underline hover:text-[var(--brand-accent)]"
                  >
                    {t("checkout.acceptPolicyLink")}
                  </Link>
                  .
                </span>
              </label>

              <p className="text-[11px] text-muted-foreground font-sans mb-5 pl-6">
                {t("policy.returnsShort")}{" "}
                <Link
                  href="/policy"
                  className="text-[var(--brand-ink)] underline hover:text-[var(--brand-accent)] transition-colors"
                >
                  {t("checkout.readPolicy")}
                </Link>
              </p>

              {config && config.enabled === false ? (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 font-sans">
                  {t("checkout.unavailable")}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={submitting || !accepted}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--brand-ink)] text-[var(--brand-accent)] py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lock size={14} />
                  {submitting
                    ? t("checkout.redirecting")
                    : t("checkout.payNow")}
                </button>
              )}

              <p className="text-[10px] text-center text-muted-foreground font-sans mt-3 flex items-center justify-center gap-1">
                <Lock size={10} /> {t("checkout.securedByStripe")}
              </p>

              <button
                type="button"
                onClick={() => {
                  clear();
                  navigate("/shop");
                }}
                className="w-full text-muted-foreground text-[11px] uppercase tracking-[0.15em] font-sans hover:text-foreground transition-colors mt-4"
              >
                {t("checkout.clearBag")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
