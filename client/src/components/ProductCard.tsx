import { useState } from "react";
import { Eye, EyeOff, Trash2, ShoppingBag, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductItem } from "@shared/types";
import ProductModal from "./ProductModal";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  product: ProductItem;
  onMutated?: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Necklaces: "bg-[#F5EFE8] text-[#8B6914]",
  Earrings: "bg-[#E8E8E8] text-[#555]",
  Sets: "bg-[#F5E8F0] text-[#8B2D6B]",
  Rings: "bg-[#E8F4EC] text-[#2D6B4A]",
  Bracelets: "bg-[#EEE8F5] text-[#5A2D82]",
  Bangles: "bg-[#F5E8E8] text-[#8B2020]",
  Anklets: "bg-[#E8F0E8] text-[#2D4A20]",
  Brooches: "bg-[#FFF0DC] text-[#8B5914]",
  "Hair Accessories": "bg-[#E8EEF5] text-[#1A3D6B]",
  Other: "bg-[#EEEEEE] text-[#666]",
};

export default function ProductCard({ product, onMutated }: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();

  const displayName = (i18n.language === "en" && product.nameEn) ? product.nameEn : product.name;
  const displayDescription = (i18n.language === "en" && product.descriptionEn) ? product.descriptionEn : product.description;

  /* Lazy-load extra images the first time the card is hovered; staleTime:
     Infinity so they stay cached for repeat hovers without re-fetching.   */
  const { data: extraImages = [] } = trpc.products.getImages.useQuery(
    { productId: product.id },
    { enabled: hovered, staleTime: Infinity }
  );

  const allImages: string[] = [
    ...(product.imageUrl ? [product.imageUrl] : []),
    ...extraImages.map((img) => img.imageUrl),
  ];
  const total = allImages.length;
  const hasMultiple = total > 1;

  /* ── Admin mutations ─────────────────────────────────────────────────────── */

  const toggleMutation = trpc.products.toggleVisibility.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.products.adminList.invalidate();
      toast.success(product.visible ? "Product hidden from shop" : "Product is now visible");
      onMutated?.();
    },
    onError: () => toast.error("Failed to update visibility"),
  });

  const toggleSoldMutation = trpc.products.toggleSold.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.products.adminList.invalidate();
      toast.success(product.sold ? "Product marked as available" : "Product marked as sold");
      onMutated?.();
    },
    onError: () => toast.error("Failed to update sold status"),
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.products.adminList.invalidate();
      toast.success(`"${displayName}" deleted`);
      onMutated?.();
    },
    onError: () => toast.error("Failed to delete product"),
  });

  /* ── Handlers ────────────────────────────────────────────────────────────── */

  const handleHide = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleMutation.mutate({ id: product.id, visible: !product.visible });
  };

  const handleToggleSold = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSoldMutation.mutate({ id: product.id, sold: !product.sold });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Permanently delete "${displayName}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ id: product.id });
  };

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImg((i) => (i - 1 + total) % total);
  };

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImg((i) => (i + 1) % total);
  };

  const handleMouseEnter = () => setHovered(true);
  const handleMouseLeave = () => {
    setHovered(false);
    setActiveImg(0);
  };

  return (
    <>
      <article
        className="group cursor-pointer bg-card card-hover relative"
        onClick={() => setOpen(true)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
        aria-label={`View ${displayName}`}
      >
        {/* ── Admin controls ─────────────────────────────────────────────────── */}
        {isAdmin && (
          // Event boundary: keep clicks/keys on the admin controls from bubbling
          // to the card's open-on-activate handler. Not itself a control.
          // biome-ignore lint/a11y/noStaticElementInteractions: propagation boundary, not an interactive widget
          <div
            className="absolute top-2 right-2 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleToggleSold}
              disabled={toggleSoldMutation.isPending}
              title={product.sold ? "Mark as available" : "Mark as sold"}
              className="flex items-center justify-center w-8 h-8 bg-amber-700/90 text-white hover:bg-amber-600 transition-colors rounded-sm backdrop-blur-sm disabled:opacity-50"
            >
              <ShoppingBag size={13} />
            </button>
            <button
              type="button"
              onClick={handleHide}
              disabled={toggleMutation.isPending}
              title={product.visible ? "Hide from shop" : "Show in shop"}
              className="flex items-center justify-center w-8 h-8 bg-[var(--brand-ink)]/90 text-white hover:bg-[var(--brand-ink-hover)] transition-colors rounded-sm backdrop-blur-sm disabled:opacity-50"
            >
              {product.visible ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              title="Delete permanently"
              className="flex items-center justify-center w-8 h-8 bg-red-700/90 text-white hover:bg-red-600 transition-colors rounded-sm backdrop-blur-sm disabled:opacity-50"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* ── Image carousel ─────────────────────────────────────────────────── */}
        <div className="img-overlay aspect-[3/4] bg-[var(--brand-surface-3)] overflow-hidden relative">
          {product.imageUrl ? (
            <>
              {/* All images stacked; active shown via opacity crossfade */}
              {allImages.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={i === 0 ? displayName : `${displayName} — view ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    opacity: i === activeImg ? (product.sold ? 0.6 : 1) : 0,
                    /* Include both so the inline shorthand doesn't override the CSS transform transition */
                    transition: "opacity 400ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              ))}

              {/* Prev / Next arrows — appear when multiple images are loaded */}
              {hasMultiple && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center
                               bg-black/30 text-white hover:bg-black/55 transition-colors
                               opacity-0 group-hover:opacity-100 duration-200"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center
                               bg-black/30 text-white hover:bg-black/55 transition-colors
                               opacity-0 group-hover:opacity-100 duration-200"
                  >
                    <ChevronRight size={14} />
                  </button>
                </>
              )}

              {/* Dot indicators — always visible once multiple images are known */}
              {hasMultiple && (
                // Event boundary for the dot controls — see note above.
                // biome-ignore lint/a11y/noStaticElementInteractions: propagation boundary, not an interactive widget
                <div
                  className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {allImages.map((_, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setActiveImg(i); }}
                      aria-label={`Image ${i + 1} of ${total}`}
                      style={{
                        width: i === activeImg ? "14px" : "5px",
                        height: "4px",
                        borderRadius: "2px",
                        background: i === activeImg ? "var(--brand-accent)" : "rgba(255,255,255,0.6)",
                        transition: "width 300ms cubic-bezier(0.22,1,0.36,1), background 200ms ease",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              )}

              {/* SOLD badge */}
              {product.sold && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div className="bg-[var(--brand-ink)]/80 text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] font-sans px-4 py-2 backdrop-blur-sm border border-[var(--brand-accent)]/40">
                    {t("product.sold")}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-5xl text-[var(--brand-accent)]/30 font-serif">◇</span>
            </div>
          )}
        </div>

        {/* ── Product info ───────────────────────────────────────────────────── */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-serif text-foreground text-lg leading-tight group-hover:text-[var(--brand-ink)] transition-colors">
              {displayName}
            </h3>
          </div>
          <span
            className={`inline-block text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 mb-2 font-sans ${
              CATEGORY_COLORS[product.category] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {product.category}
          </span>
          <p className="text-muted-foreground text-sm line-clamp-2 font-sans leading-relaxed mb-3">
            {displayDescription}
          </p>
          <div className="flex items-center gap-3">
            <p className={`font-serif text-xl ${product.sold ? "text-muted-foreground line-through" : "text-[var(--brand-ink)]"}`}>
              CHF {Number(product.price).toFixed(2)}
            </p>
            {product.sold && (
              <span className="text-[10px] uppercase tracking-[0.15em] font-sans text-amber-700 bg-amber-50 px-2 py-0.5">
                {t("product.sold")}
              </span>
            )}
          </div>
        </div>
      </article>

      <ProductModal product={product} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
