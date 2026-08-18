import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Eye, EyeOff, Trash2, Pencil, Loader2 } from "lucide-react";
import { categoryColor } from "@/lib/categoryColors";
import ProductImageManager from "@/components/ProductImageManager";
import ProductEditFields from "./ProductEditFields";
import {
  useProductAdminActions,
  type AdminProduct,
} from "./useProductAdminActions";

interface ProductCardProps {
  product: AdminProduct;
  onRefetch: () => void;
}

/**
 * The catalogue's thumbnail skin: the same product, the same actions as the
 * table row, laid out around a picture instead of a line of cells.
 *
 * It exists because the view toggle promised it — "Grid view with thumbnails"
 * used to render the identical table, so the button read as broken. A merchant
 * who works from photographs recognises a piece by its image long before its
 * name, so this is the view where the image is the primary key.
 */
export default function ProductCard({ product, onRefetch }: ProductCardProps) {
  const { t } = useTranslation("admin");
  const a = useProductAdminActions(product, onRefetch);

  return (
    // Each card is one self-contained product, and its icon buttons repeat per
    // card — the label is what tells them (and a screen reader) apart.
    <article
      aria-label={product.name}
      className={`bg-white border border-[var(--brand-border)] flex flex-col transition-colors hover:border-[var(--brand-ink)]/40 ${!product.visible ? "opacity-60" : ""}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-[var(--brand-surface-3)] overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl text-[var(--brand-accent)]/30 font-serif">
              ◇
            </span>
          </div>
        )}
        <span
          className={`absolute top-2 left-2 text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 font-sans ${product.visible ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
        >
          {product.visible
            ? t("catalog.admin.row.visible")
            : t("catalog.admin.row.hidden")}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <p className="font-serif text-foreground text-sm leading-snug">
            {product.name}
          </p>
          {product.nameEn && (
            <p className="text-muted-foreground text-xs font-sans">
              {product.nameEn}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 font-sans ${categoryColor(product.category)}`}
          >
            {product.category}
          </span>
          {/* Cormorant defaults to oldstyle figures, which renders a price as
              letters; money needs lining numerals. */}
          <span className="font-serif text-[var(--brand-ink)] text-sm lining-nums">
            CHF {Number(product.price).toFixed(2)}
          </span>
        </div>

        {/* Stock — the same stepper the table row uses, so a count committed
            here commits there. */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans mr-1">
            {t("catalog.admin.card.qty")}
          </span>
          <button
            type="button"
            onClick={() => a.stepQty(-1)}
            disabled={a.isBusy || parseInt(a.qtyValue, 10) <= 0}
            className="w-6 h-6 flex items-center justify-center border border-[var(--brand-ink)]/20 text-muted-foreground hover:border-[var(--brand-ink)] hover:text-foreground transition-colors disabled:opacity-30 text-sm leading-none"
          >
            −
          </button>
          <input
            type="number"
            min="0"
            aria-label={t("catalog.admin.card.qtyLabel", {
              name: product.name,
            })}
            value={a.qtyValue}
            onChange={(e) => a.setQtyValue(e.target.value)}
            onBlur={a.commitQty}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-10 text-center text-sm font-sans border border-[var(--brand-ink)]/20 py-0.5 focus:outline-none focus:border-[var(--brand-accent)] bg-transparent lining-nums"
          />
          <button
            type="button"
            onClick={() => a.stepQty(1)}
            disabled={a.isBusy}
            className="w-6 h-6 flex items-center justify-center border border-[var(--brand-ink)]/20 text-muted-foreground hover:border-[var(--brand-ink)] hover:text-foreground transition-colors disabled:opacity-30 text-sm leading-none"
          >
            +
          </button>
        </div>

        <ProductImageManager
          productId={product.id}
          productName={product.name}
        />

        {/* Actions */}
        <div className="flex items-center gap-1 mt-auto pt-2 border-t border-[var(--brand-border)]">
          <button
            type="button"
            onClick={() => (a.editing ? a.setEditing(false) : a.startEdit())}
            title={
              a.editing
                ? t("catalog.admin.row.cancelEditTitle")
                : t("catalog.admin.row.editTitle")
            }
            className={`p-2 transition-colors ${a.editing ? "text-[var(--brand-accent)]" : "text-muted-foreground hover:text-[var(--brand-ink)]"}`}
          >
            <Pencil size={15} />
          </button>

          <button
            type="button"
            onClick={a.toggleVisible}
            disabled={a.isBusy}
            title={
              product.visible
                ? t("catalog.admin.row.hideTitle")
                : t("catalog.admin.row.showTitle")
            }
            className="p-2 text-muted-foreground hover:text-[var(--brand-ink)] transition-colors disabled:opacity-40"
          >
            {a.toggleMutation.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : product.visible ? (
              <EyeOff size={15} />
            ) : (
              <Eye size={15} />
            )}
          </button>

          {a.confirmingDelete ? (
            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={a.confirmDelete}
                disabled={a.deleteMutation.isPending}
                className="px-2 py-1 text-[11px] uppercase tracking-wide font-sans text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                {t("catalog.admin.row.confirmDelete")}
              </button>
              <button
                type="button"
                onClick={() => a.setConfirmingDelete(false)}
                className="px-2 py-1 text-[11px] font-sans text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("catalog.admin.row.cancelDelete")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => a.setConfirmingDelete(true)}
              disabled={a.isBusy}
              title={t("catalog.admin.row.deleteTitle")}
              className="p-2 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40"
            >
              {a.deleteMutation.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Trash2 size={15} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Inline editor — the card is one grid cell wide, so the form opens
          beneath it rather than spilling sideways. */}
      {a.editing && (
        <div className="border-t border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-4">
          <ProductEditFields
            productId={product.id}
            form={a.editForm}
            setForm={a.setEditForm}
            onSave={a.handleSaveEdit}
            onCancel={() => a.setEditing(false)}
            saving={a.updateMutation.isPending}
          />
        </div>
      )}
    </article>
  );
}
