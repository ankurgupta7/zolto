import { useState, useEffect } from "react";
import { categoryColor } from "@/lib/categoryColors";
import { Link } from "wouter";
import type { ProductItem } from "@shared/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, ShoppingBag, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatPrice, useCurrency } from "@/lib/money";
import { localizedDescription, localizedName } from "@/lib/localize";
import { useCart } from "@/contexts/CartContext";
import ImageLightbox from "./ImageLightbox";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";

interface Props {
  product: ProductItem;
  open: boolean;
  onClose: () => void;
}

const WhatsAppIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-4 h-4"
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export default function ProductModal({ product, open, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const { addItem, has, openCart } = useCart();
  const inCart = has(product.id);

  const displayName = localizedName(product, i18n.language);
  const displayDescription = localizedDescription(product, i18n.language);

  const handleAddToCart = () => {
    addItem(product);
    toast.success(t("cart.added", { name: displayName }));
    onClose();
    openCart();
  };

  const { data: extraImages = [] } = trpc.products.getImages.useQuery(
    { productId: product.id },
    { enabled: open },
  );

  const allImages = [
    ...(product.imageUrl ? [{ id: -1, imageUrl: product.imageUrl }] : []),
    ...extraImages.map((img) => ({ id: img.id, imageUrl: img.imageUrl })),
  ];

  const total = allImages.length;

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setActiveIdx(carouselApi.selectedScrollSnap());
    carouselApi.on("select", onSelect);
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  const handleClose = () => {
    onClose();
    setActiveIdx(0);
  };

  const enquiryText = product.sold
    ? t("product.enquirySimilar", { name: displayName })
    : t("product.enquiryAvailable", { name: displayName });

  const whatsappUrl = `https://wa.me/41791721714?text=${encodeURIComponent(enquiryText)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-sm p-0 bg-card border-0 shadow-2xl rounded-xl flex flex-col max-h-[90vh]"
      >
        {/* Close button — high-contrast so it's visible over any product photo */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 z-30 w-9 h-9 flex items-center justify-center bg-black/70 text-white hover:bg-black/90 transition-colors rounded-full shadow-lg ring-1 ring-white/20"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Image area — fixed height, never scrolls away */}
        <div className="aspect-[4/3] bg-[var(--brand-surface-3)] relative overflow-hidden flex-shrink-0">
          {total === 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-7xl text-[var(--brand-accent)]/20 font-serif">
                ◇
              </span>
            </div>
          ) : total === 1 ? (
            <button
              type="button"
              className="relative w-full h-full group cursor-zoom-in block p-0 border-0 bg-transparent"
              onClick={() => setLightboxIdx(0)}
            >
              <img
                src={allImages[0].imageUrl}
                alt={displayName}
                className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02] ${product.sold ? "opacity-60" : ""}`}
              />
              {product.sold && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-[var(--brand-ink)]/80 text-[var(--brand-accent)] text-sm uppercase tracking-[0.3em] font-sans px-5 py-2.5 backdrop-blur-sm border border-[var(--brand-accent)]/40">
                    {t("product.sold")}
                  </div>
                </div>
              )}
            </button>
          ) : (
            <div className="relative w-full h-full">
              <Carousel
                setApi={setCarouselApi}
                opts={{ loop: true, align: "start" }}
                className="w-full h-full"
              >
                <CarouselContent className="h-full">
                  {allImages.map((img, i) => (
                    <CarouselItem key={img.id} className="h-full">
                      <button
                        type="button"
                        className="w-full h-full aspect-[4/3] group cursor-zoom-in block p-0 border-0 bg-transparent"
                        onClick={() => setLightboxIdx(i)}
                      >
                        <img
                          src={img.imageUrl}
                          alt={`${displayName} ${i + 1}`}
                          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02] ${product.sold ? "opacity-60" : ""}`}
                        />
                      </button>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="left-2 bg-black/30 border-0 text-white hover:bg-black/50 hover:text-white" />
                <CarouselNext className="right-2 bg-black/30 border-0 text-white hover:bg-black/50 hover:text-white" />
              </Carousel>

              {product.sold && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div className="bg-[var(--brand-ink)]/80 text-[var(--brand-accent)] text-sm uppercase tracking-[0.3em] font-sans px-5 py-2.5 backdrop-blur-sm border border-[var(--brand-accent)]/40">
                    {t("product.sold")}
                  </div>
                </div>
              )}

              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {allImages.map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => carouselApi?.scrollTo(i)}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      i === activeIdx
                        ? "bg-[var(--brand-accent)] w-4"
                        : "bg-white/50 hover:bg-white/80 w-1.5"
                    }`}
                    aria-label={`Go to image ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Details — scrolls if taller than remaining viewport space */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <span
            className={`inline-block text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 mb-3 font-sans ${categoryColor(
              product.category,
            )}`}
          >
            {product.category}
          </span>

          {/* Title as link to full product page */}
          <div className="flex items-start gap-2 mb-1">
            <Link
              href={`/product/${product.id}`}
              onClick={handleClose}
              className="group flex-1"
            >
              <h2 className="font-serif text-foreground text-xl leading-snug group-hover:text-[var(--brand-ink)] transition-colors">
                {displayName}
                <span className="ml-1.5 text-[var(--brand-accent)] text-base opacity-0 group-hover:opacity-100 transition-opacity">
                  →
                </span>
              </h2>
            </Link>
            {product.sold && (
              <span className="text-[10px] uppercase tracking-[0.2em] font-sans text-amber-700 bg-amber-50 px-2 py-0.5 border border-amber-200 mt-1 flex-shrink-0">
                {t("product.sold")}
              </span>
            )}
          </div>

          <div className="divider-gold my-3" />

          <p className="text-muted-foreground text-sm font-sans leading-relaxed mb-4 line-clamp-2">
            {displayDescription}
          </p>

          <p
            className={`font-serif text-2xl mb-4 ${product.sold ? "text-muted-foreground line-through" : "text-[var(--brand-ink)]"}`}
          >
            {formatPrice(Number(product.price), currency)}
          </p>

          {product.sold ? (
            <div className="flex flex-col gap-2">
              <div className="inline-flex items-center justify-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 px-6 py-3 text-xs uppercase tracking-[0.1em] font-sans">
                {t("product.sold")}
              </div>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-6 py-3 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[#1ebe5d] transition-colors duration-200"
              >
                <WhatsAppIcon />
                {t("product.enquireWhatsApp")}
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {inCart ? (
                <button
                  type="button"
                  onClick={openCart}
                  className="inline-flex items-center justify-center gap-2 w-full bg-[var(--brand-ink)] text-[var(--brand-accent)] px-6 py-3 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors duration-200"
                >
                  <Check size={14} />
                  {t("product.inBag")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="inline-flex items-center justify-center gap-2 w-full bg-[var(--brand-ink)] text-[var(--brand-accent)] px-6 py-3 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors duration-200"
                >
                  <ShoppingBag size={14} />
                  {t("product.addToBag")}
                </button>
              )}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full bg-white border border-[#25D366] text-[#1ebe5d] px-6 py-3 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[#25D366] hover:text-white transition-colors duration-200"
              >
                <WhatsAppIcon />
                {t("product.enquireWhatsApp")}
              </a>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mt-3 font-sans text-center">
            {t("product.uniqueCaption")}
          </p>
        </div>
      </DialogContent>

      {lightboxIdx !== null && (
        <ImageLightbox
          images={allImages.map((img) => img.imageUrl)}
          activeIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNext={() => setLightboxIdx((lightboxIdx + 1) % total)}
          onPrev={() => setLightboxIdx((lightboxIdx - 1 + total) % total)}
          onGoTo={(i) => setLightboxIdx(i)}
        />
      )}
    </Dialog>
  );
}
