/**
 * Picks the best translated product name/description for the current UI
 * language, falling back to the primary (untranslated) fields.
 */

export interface LocalizableProduct {
  name: string;
  description?: string | null;
  nameEn?: string | null;
  descriptionEn?: string | null;
  nameDe?: string | null;
  descriptionDe?: string | null;
  nameFr?: string | null;
  descriptionFr?: string | null;
}

type TranslatableField = "name" | "description";

function pick(
  product: LocalizableProduct,
  field: TranslatableField,
  language: string,
): string {
  const primary = product[field] ?? "";
  const lang = language.toLowerCase();
  const key = (field === "name" ? "name" : "description") as
    "name" | "description";
  const suffix = lang.startsWith("fr")
    ? "Fr"
    : lang.startsWith("en")
      ? "En"
      : lang.startsWith("de")
        ? "De"
        : null;
  if (suffix) {
    const translated = product[
      `${key}${suffix}` as keyof LocalizableProduct
    ] as string | null | undefined;
    if (translated && translated.trim().length > 0) return translated;
  }
  return primary;
}

export function localizedName(
  product: LocalizableProduct,
  language: string,
): string {
  return pick(product, "name", language);
}

export function localizedDescription(
  product: LocalizableProduct,
  language: string,
): string {
  return pick(product, "description", language);
}
