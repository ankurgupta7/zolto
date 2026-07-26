import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { formatPrice, useCurrency } from "@/lib/money";
import { localizedName } from "@/lib/localize";
import { ShoppingBag, Trash2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { useCart } from "@/contexts/CartContext";

export default function CartDrawer() {
  const { items, total, count, removeItem, isOpen, setOpen, closeCart } =
    useCart();
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const [, navigate] = useLocation();

  const goToCheckout = () => {
    closeCart();
    navigate("/checkout");
  };

  const displayName = (i: (typeof items)[number]) =>
    localizedName(i, i18n.language);

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col bg-[var(--brand-surface)] p-0">
        <SheetHeader className="px-6 py-5 border-b border-[var(--brand-border)]">
          <SheetTitle className="font-serif text-[var(--brand-ink)] text-xl flex items-center gap-2">
            <ShoppingBag size={18} className="text-[var(--brand-accent)]" />
            {t("cart.title")}
            {count > 0 && (
              <span className="text-sm text-muted-foreground font-sans font-normal">
                ({count})
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="text-5xl text-[var(--brand-accent)]/20 font-serif mb-4">
              ◇
            </div>
            <p className="text-muted-foreground text-sm font-sans">
              {t("cart.empty")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 items-start">
                  <div className="w-20 h-24 bg-[var(--brand-surface-3)] flex-shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={displayName(item)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl text-[var(--brand-accent)]/30 font-serif">
                        ◇
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-serif text-foreground text-base leading-tight mb-1 truncate">
                      {displayName(item)}
                    </h4>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans mb-1">
                      {item.category}
                    </p>
                    <p className="font-serif text-[var(--brand-ink)] text-lg">
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

            <SheetFooter className="border-t border-[var(--brand-border)] px-6 py-5 gap-3">
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-sm uppercase tracking-[0.15em] font-sans text-muted-foreground">
                  {t("cart.subtotal")}
                </span>
                <span className="font-serif text-2xl text-[var(--brand-ink)]">
                  {formatPrice(total, currency)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-sans">
                {t("cart.taxNote")}
              </p>
              <button
                type="button"
                onClick={goToCheckout}
                className="w-full bg-[var(--brand-ink)] text-[var(--brand-accent)] py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors duration-200"
              >
                {t("cart.checkout")}
              </button>
              <button
                type="button"
                onClick={closeCart}
                className="w-full flex items-center justify-center gap-1.5 text-muted-foreground text-xs uppercase tracking-[0.15em] font-sans hover:text-foreground transition-colors"
              >
                <X size={13} />
                {t("cart.continue")}
              </button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
