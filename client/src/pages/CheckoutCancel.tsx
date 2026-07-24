import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { XCircle } from "lucide-react";

export default function CheckoutCancel() {
  const { t } = useTranslation();

  return (
    <div className="page-enter pt-28 pb-24 min-h-[60vh]">
      <div className="container max-w-2xl text-center">
        <XCircle className="w-16 h-16 text-amber-600 mx-auto mb-6" />
        <h1 className="font-serif text-foreground text-3xl mb-3">
          {t("cancel.title")}
        </h1>
        <div className="divider-gold w-16 mx-auto mb-6" />
        <p className="text-muted-foreground text-sm font-sans leading-relaxed mb-8">
          {t("cancel.body")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/checkout"
            className="inline-flex justify-center bg-[var(--brand-ink)] text-[var(--brand-accent)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
          >
            {t("cancel.backToCheckout")}
          </Link>
          <Link
            href="/shop"
            className="inline-flex justify-center border border-[var(--brand-ink)] text-[var(--brand-ink)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-[var(--brand-accent)] transition-colors"
          >
            {t("cancel.continueShopping")}
          </Link>
        </div>
      </div>
    </div>
  );
}
