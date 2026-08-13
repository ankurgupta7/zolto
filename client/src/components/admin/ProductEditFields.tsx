import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Loader2, Check, X } from "lucide-react";
import type { ProductCategory } from "@shared/types";
import { useCategories } from "@/hooks/useCategories";
import type { EditForm } from "./useProductAdminActions";

/**
 * Translation inputs rendered for the inline editor; the primary
 * name/description (German by convention) keep their own required fields.
 */
const EDIT_LOCALES = [
  { code: "EN", nameKey: "nameEn", descKey: "descriptionEn" },
  { code: "FR", nameKey: "nameFr", descKey: "descriptionFr" },
  { code: "IT", nameKey: "nameIt", descKey: "descriptionIt" },
] as const;

interface ProductEditFieldsProps {
  productId: number;
  form: EditForm;
  setForm: Dispatch<SetStateAction<EditForm>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

/**
 * The inline editor's body, without the container it sits in — the table view
 * wraps it in a spanning cell, the thumbnail view in the card's own panel.
 * Field ids are suffixed with the product id so several editors can be open at
 * once without their labels pointing at each other's inputs.
 */
export default function ProductEditFields({
  productId,
  form,
  setForm,
  onSave,
  onCancel,
  saving,
}: ProductEditFieldsProps) {
  const { t } = useTranslation("admin");
  // Store's own category keys (server-driven, per-tenant).
  const CATEGORIES = useCategories().categories.map((c) => c.key);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor={`edit-name-${productId}`}
            className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
          >
            {t("catalog.admin.row.fieldName", { code: "DE" })} *
          </label>
          <input
            id={`edit-name-${productId}`}
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
          />
        </div>
        {EDIT_LOCALES.map(({ code, nameKey }) => (
          <div key={nameKey}>
            <label
              htmlFor={`edit-${nameKey}-${productId}`}
              className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
            >
              {t("catalog.admin.row.fieldName", { code })}
            </label>
            <input
              id={`edit-${nameKey}-${productId}`}
              type="text"
              value={form[nameKey]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [nameKey]: e.target.value }))
              }
              className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
            />
          </div>
        ))}
        <div>
          <label
            htmlFor={`edit-price-${productId}`}
            className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
          >
            {t("catalog.admin.row.fieldPrice")} *
          </label>
          <input
            id={`edit-price-${productId}`}
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
          />
        </div>
        <div>
          <label
            htmlFor={`edit-category-${productId}`}
            className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
          >
            {t("catalog.admin.row.fieldCategory")} *
          </label>
          <select
            id={`edit-category-${productId}`}
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                category: e.target.value as ProductCategory,
              }))
            }
            className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`edit-description-${productId}`}
            className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
          >
            {t("catalog.admin.row.fieldDescription", { code: "DE" })} *
          </label>
          <textarea
            id={`edit-description-${productId}`}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={3}
            className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white resize-none"
          />
        </div>
        {EDIT_LOCALES.map(({ code, descKey }) => (
          <div key={descKey}>
            <label
              htmlFor={`edit-${descKey}-${productId}`}
              className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
            >
              {t("catalog.admin.row.fieldDescription", { code })}
            </label>
            <textarea
              id={`edit-${descKey}-${productId}`}
              value={form[descKey]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [descKey]: e.target.value }))
              }
              rows={3}
              className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white resize-none"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[var(--brand-ink)] text-white px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          {t("catalog.admin.row.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 border border-[var(--brand-ink)]/20 text-muted-foreground px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-[var(--brand-ink)] hover:text-foreground transition-colors"
        >
          <X size={13} />
          {t("catalog.admin.row.cancel")}
        </button>
      </div>
    </>
  );
}
