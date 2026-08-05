import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { matchSupportedLanguage } from "@/lib/languages";

export interface StoreCategory {
  key: string;
  labelEn: string;
  labelDe: string | null;
  labelFr: string | null;
  labelIt: string | null;
  extraIncludes: string[];
  sortOrder: number;
}

/**
 * The store's category list, fetched from the server (per-tenant, seeded
 * from the merchant's vertical preset and editable in admin → Categories).
 * `label` resolves the display label for the current UI language, falling
 * back to the English label and then the key itself so an unknown/custom
 * category still renders.
 */
export function useCategories() {
  const { i18n } = useTranslation();
  const query = trpc.categories.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const categories: StoreCategory[] = useMemo(
    () => query.data ?? [],
    [query.data],
  );

  const byKey = useMemo(
    () => new Map(categories.map((c) => [c.key, c])),
    [categories],
  );

  const lang = matchSupportedLanguage(i18n?.language);

  const label = useCallback(
    (key: string): string => {
      const row = byKey.get(key);
      if (!row) return key;
      const localized =
        lang === "de"
          ? row.labelDe
          : lang === "fr"
            ? row.labelFr
            : lang === "it"
              ? row.labelIt
              : row.labelEn;
      return localized ?? row.labelEn ?? key;
    },
    [byKey, lang],
  );

  const extraIncludesFor = useCallback(
    (key: string): string[] => byKey.get(key)?.extraIncludes ?? [],
    [byKey],
  );

  return {
    categories,
    label,
    extraIncludesFor,
    isLoading: query.isLoading,
    error: query.error,
  };
}
