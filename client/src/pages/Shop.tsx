import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import ProductCard from "@/components/ProductCard";
import {
  PRODUCT_CATEGORIES,
  CATEGORY_EXTRA_INCLUDES,
  type ProductCategory,
} from "@shared/types";
import { useTranslation } from "react-i18next";

const CATEGORY_VALUES: (ProductCategory | "All")[] = [
  "All",
  ...PRODUCT_CATEGORIES,
];

// Extra categories folded into a category's listing (e.g. Sets show under
// Necklaces/Earrings). Sourced from the single shared definition so the web
// shop and POS apps never drift.
const extraIncludesFor = (
  cat: ProductCategory | "All"
): readonly ProductCategory[] =>
  (CATEGORY_EXTRA_INCLUDES as Record<string, readonly ProductCategory[]>)[cat] ??
  [];

export default function Shop() {
  const { t } = useTranslation();
  const [_location] = useLocation();
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "All">(
    "All"
  );

  const CATEGORY_LABELS: Record<string, string> = {
    All: t("categories.all"),
    Necklaces: t("categories.necklaces"),
    Earrings: t("categories.earrings"),
    Sets: t("categories.sets"),
    Rings: t("categories.rings"),
    Bracelets: t("categories.bracelets"),
    Bangles: t("categories.bangles"),
    Anklets: t("categories.anklets"),
    Brooches: t("categories.brooches"),
    "Hair Accessories": t("categories.hairAccessories"),
    Other: t("categories.other"),
  };

  // Read category from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    if (cat && CATEGORY_VALUES.includes(cat as ProductCategory)) {
      setActiveCategory(cat as ProductCategory);
    }
  }, []);

  const { data: allProducts, isLoading } = trpc.products.list.useQuery({});

  const products =
    allProducts && activeCategory !== "All"
      ? allProducts.filter(
          p =>
            p.category === activeCategory ||
            extraIncludesFor(activeCategory).includes(p.category)
        )
      : allProducts;

  const availableCategories = useMemo(
    () => new Set(allProducts?.map(p => p.category) ?? []),
    [allProducts]
  );
  const visibleCategoryValues = CATEGORY_VALUES.filter(
    cat => cat === "All" || availableCategories.has(cat)
  );

  return (
    <div className="page-enter pt-20">
      {/* Header */}
      <section className="bg-[var(--brand-ink)] py-20">
        <div className="container text-center">
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {t("shop.badge")}
          </p>
          <h1 className="font-serif text-white">{t("shop.title")}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      {/* Category Filters */}
      <section className="bg-[var(--brand-surface)] border-b border-[var(--brand-border)] sticky top-16 md:top-20 z-30">
        <div className="container">
          <div className="flex items-center gap-1 overflow-x-auto py-4 scrollbar-hide">
            {visibleCategoryValues.map(cat => (
              <button
                type="button"
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-5 py-2 text-xs uppercase tracking-[0.15em] font-sans transition-all duration-200 ${
                  activeCategory === cat
                    ? "bg-[var(--brand-ink)] text-[var(--brand-accent)]"
                    : "text-[var(--brand-ink)]/60 hover:text-[var(--brand-ink)] hover:bg-[var(--brand-ink)]/5"
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Product Grid */}
      <section className="py-16 bg-background">
        <div className="container">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] bg-muted mb-4" />
                  <div className="h-4 bg-muted rounded mb-2 w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <>
              <p className="text-muted-foreground text-sm font-sans mb-8">
                {t("shop.pieces", { count: products.length })}
                {activeCategory !== "All"
                  ? ` ${t("shop.inCategory", { category: CATEGORY_LABELS[activeCategory] ?? activeCategory })}`
                  : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-24">
              <div className="text-6xl text-[var(--brand-accent)]/20 font-serif mb-6">
                ◇
              </div>
              <h3 className="font-serif text-foreground text-xl mb-3">
                {t("shop.noPiecesTitle")}
              </h3>
              <p className="text-muted-foreground text-sm font-sans">
                {activeCategory !== "All"
                  ? t("shop.noPiecesCategory", {
                      category:
                        CATEGORY_LABELS[activeCategory] ?? activeCategory,
                    })
                  : t("shop.noPiecesAll")}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
