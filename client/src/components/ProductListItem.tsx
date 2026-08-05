import { Eye, EyeOff, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
// Ensure the shared i18n instance is initialized even when this row is
// rendered in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
import { formatPrice, useCurrency } from "@/lib/money";

/** Swiss regional locale for the active UI language ("it" → "it-CH"). */
function dateLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

interface ProductListItemProps {
  product: {
    id: number;
    name: string;
    description: string;
    price: string;
    category: string;
    imageUrl: string | null;
    visible: boolean;
    sold: boolean;
    quantity: number;
    createdAt: Date;
  };
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  onToggleSold: () => void;
}

export default function ProductListItem({
  product,
  onEdit,
  onDelete,
  onToggleVisibility,
  onToggleSold,
}: ProductListItemProps) {
  const [isHovering, setIsHovering] = useState(false);
  const { t, i18n } = useTranslation();
  const currency = useCurrency();

  const formattedDate = new Date(product.createdAt).toLocaleDateString(
    dateLocale(i18n.language),
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only hover affordance that reveals row actions; no keyboard semantics are implied
    <div
      className="flex items-center gap-4 px-6 py-4 border-b border-[var(--brand-border)] hover:bg-[#F9F7F3] transition-colors"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Product Image */}
      {product.imageUrl && (
        <div className="flex-shrink-0 w-16 h-16 bg-[var(--brand-surface)] rounded overflow-hidden">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Product Info */}
      <div className="flex-grow min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className="font-serif text-foreground text-sm font-medium truncate">
            {product.name}
          </h3>
          <span className="text-xs text-muted-foreground font-sans flex-shrink-0">
            {formattedDate}
          </span>
        </div>
        <p className="text-xs text-muted-foreground font-sans line-clamp-1">
          {product.description}
        </p>
      </div>

      {/* Price and Status */}
      <div className="flex-shrink-0 text-right mr-4">
        <div className="font-serif text-foreground text-sm font-medium">
          {formatPrice(Number(product.price), currency)}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground font-sans mt-1">
          <span>{t("productList.qty", { quantity: product.quantity })}</span>
          {product.sold && (
            <span className="text-red-600 font-medium">
              • {t("product.sold")}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={`flex items-center gap-2 flex-shrink-0 transition-opacity ${isHovering ? "opacity-100" : "opacity-60"}`}
      >
        <button
          type="button"
          onClick={onToggleVisibility}
          title={
            product.visible
              ? t("productList.hideFromShop")
              : t("productList.showInShop")
          }
          className="p-2 hover:bg-[var(--brand-border)] rounded transition-colors"
        >
          {product.visible ? (
            <Eye size={16} className="text-[var(--brand-ink)]" />
          ) : (
            <EyeOff size={16} className="text-muted-foreground" />
          )}
        </button>
        <button
          type="button"
          onClick={onEdit}
          title={t("productList.editProduct")}
          className="p-2 hover:bg-[var(--brand-border)] rounded transition-colors"
        >
          <Pencil size={16} className="text-[var(--brand-ink)]" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={t("productList.deleteProduct")}
          className="p-2 hover:bg-red-100 rounded transition-colors"
        >
          <Trash2 size={16} className="text-red-600" />
        </button>
      </div>
    </div>
  );
}
