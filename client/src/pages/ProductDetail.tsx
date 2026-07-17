import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ShoppingBag, Check } from "lucide-react";
import { toast } from "sonner";
import ImageLightbox from "@/components/ImageLightbox";
import { useCart } from "@/contexts/CartContext";
import { useTenant } from "@/contexts/TenantContext";
import { whatsappHref } from "@/lib/branding";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";

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

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { t, i18n } = useTranslation();
  const { addItem, has, openCart } = useCart();
  const { branding } = useTenant();
  const [activeIdx, setActiveIdx] = useState(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data: product, isLoading, error } = trpc.products.getById.useQuery(
    { id: productId },
    { enabled: !Number.isNaN(productId) }
  );

  const { data: extraImages = [] } = trpc.products.getImages.useQuery(
    { productId: productId },
    { enabled: !!product }
  );

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setActiveIdx(carouselApi.selectedScrollSnap());
    carouselApi.on("select", onSelect);
    return () => { carouselApi.off("select", onSelect); };
  }, [carouselApi]);

  if (isLoading) {
    return (
      <div className="page-enter pt-20">
        <section className="bg-[var(--brand-ink)] py-20">
          <div className="container">
            <div className="h-4 bg-white/10 rounded w-48 mb-4 animate-pulse" />
            <div className="h-9 bg-white/10 rounded w-72 animate-pulse" />
          </div>
        </section>
        <section className="py-16 bg-background">
          <div className="container max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="aspect-square bg-muted animate-pulse" />
              <div className="space-y-4">
                <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                <div className="h-8 bg-muted rounded w-3/4 animate-pulse" />
                <div className="h-1 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded w-5/6 animate-pulse" />
                <div className="h-8 bg-muted rounded w-32 animate-pulse" />
                <div className="h-12 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (error || !product || Number.isNaN(productId)) {
    return (
      <div className="page-enter pt-20">
        <section className="bg-[var(--brand-ink)] py-20">
          <div className="container text-center">
            <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">Not Found</p>
            <h1 className="font-serif text-white">This piece is unavailable</h1>
            <div className="divider-gold w-16 mx-auto mt-6" />
          </div>
        </section>
        <section className="py-16 bg-background">
          <div className="container text-center">
            <div className="text-6xl text-[var(--brand-accent)]/20 font-serif mb-6">◇</div>
            <p className="text-muted-foreground font-sans mb-8">
              This piece may have been removed or is no longer available.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-[var(--brand-ink)] text-[var(--brand-accent)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Shop
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const displayName = (i18n.language === "en" && product.nameEn) ? product.nameEn : product.name;
  const displayDescription = (i18n.language === "en" && product.descriptionEn) ? product.descriptionEn : product.description;

  const inCart = has(product.id);
  const handleAddToCart = () => {
    addItem(product);
    toast.success(t("cart.added", { name: displayName }));
    openCart();
  };

  const allImages = [
    ...(product.imageUrl ? [{ id: -1, imageUrl: product.imageUrl }] : []),
    ...extraImages.map((img) => ({ id: img.id, imageUrl: img.imageUrl })),
  ];

  const total = allImages.length;

  const productUrl = typeof window !== "undefined" ? window.location.href : `/product/${productId}`;
  const enquiryText = product.sold
    ? t("product.enquirySimilar", { name: displayName, link: productUrl })
    : t("product.enquiryAvailable", { name: displayName, link: productUrl });

  const currencyCode = branding.currency.toUpperCase();
  const whatsappUrl = branding.whatsappNumber
    ? `https://wa.me/${branding.whatsappNumber}?text=${encodeURIComponent(enquiryText)}`
    : whatsappHref(branding);

  const productSchema = product ? {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": displayName,
    "description": displayDescription,
    "image": allImages.map((img) => img.imageUrl),
    "sku": `SKU-${product.id}`,
    "brand": {
      "@type": "Brand",
      "name": branding.storeName
    },
    "category": product.category,
    "offers": {
      "@type": "Offer",
      "url": productUrl,
      "priceCurrency": currencyCode,
      "price": Number(product.price).toFixed(2),
      "availability": product.sold ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      "itemCondition": "https://schema.org/NewCondition",
      "seller": {
        "@type": "Organization",
        "name": branding.storeName
      },
      "shippingDetails": {
        "@type": "OfferShippingDetails",
        "shippingRate": {
          "@type": "MonetaryAmount",
          "value": "0",
          "currency": currencyCode
        },
        "shippingDestination": {
          "@type": "DefinedRegion"
        }
      }
    },
    ...(product.sold && {
      "availability": "https://schema.org/OutOfStock"
    })
  } : null;

  return (
    <div className="page-enter pt-20">
      {/* JSON-LD Product Schema */}
      {productSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
      )}

      {/* Header */}
      <section className="bg-[var(--brand-ink)] py-16">
        <div className="container">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs font-sans mb-5" aria-label="Breadcrumb">
            <Link href="/" className="text-[var(--brand-accent)]/60 hover:text-[var(--brand-accent)] transition-colors">
              Home
            </Link>
            <span className="text-[var(--brand-accent)]/40">/</span>
            <Link href="/shop" className="text-[var(--brand-accent)]/60 hover:text-[var(--brand-accent)] transition-colors">
              Shop
            </Link>
            <span className="text-[var(--brand-accent)]/40">/</span>
            <span className="text-[var(--brand-accent)] truncate max-w-[200px]">{displayName}</span>
          </nav>

          <span
            className={`inline-block text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 mb-4 font-sans ${
              CATEGORY_COLORS[product.category] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {product.category}
          </span>

          <h1 className="font-serif text-white text-3xl md:text-4xl leading-tight">
            {displayName}
          </h1>
          <div className="divider-gold w-16 mt-6" />
        </div>
      </section>

      {/* Main content */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 max-w-5xl mx-auto">

            {/* Image gallery */}
            <div>
              {total === 0 ? (
                <div className="aspect-square bg-[var(--brand-surface-3)] flex items-center justify-center">
                  <span className="text-8xl text-[var(--brand-accent)]/20 font-serif">◇</span>
                </div>
              ) : total === 1 ? (
                <button
                  type="button"
                  className="relative aspect-square bg-[var(--brand-surface-3)] overflow-hidden group cursor-zoom-in block w-full p-0 border-0 text-left"
                  onClick={() => setLightboxIdx(0)}
                >
                  <img
                    src={allImages[0].imageUrl}
                    alt={displayName}
                    className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02] ${product.sold ? "opacity-60" : ""}`}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-end justify-end p-3 pointer-events-none">
                    <span className="text-white/0 group-hover:text-white/80 text-xs font-sans uppercase tracking-widest transition-colors duration-200">
                      View full
                    </span>
                  </div>
                  {product.sold && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-[var(--brand-ink)]/80 text-[var(--brand-accent)] text-sm uppercase tracking-[0.3em] font-sans px-6 py-3 backdrop-blur-sm border border-[var(--brand-accent)]/40">
                        {t("product.sold")}
                      </div>
                    </div>
                  )}
                </button>
              ) : (
                <div className="relative aspect-square bg-[var(--brand-surface-3)] overflow-hidden">
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
                            className="w-full h-full aspect-square group cursor-zoom-in block p-0 border-0 bg-transparent text-left"
                            onClick={() => setLightboxIdx(i)}
                          >
                            <img
                              src={img.imageUrl}
                              alt={`${displayName} ${i + 1}`}
                              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02] ${product.sold ? "opacity-60" : ""}`}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-end justify-end p-3 pointer-events-none">
                              <span className="text-white/0 group-hover:text-white/80 text-xs font-sans uppercase tracking-widest transition-colors duration-200">
                                View full
                              </span>
                            </div>
                          </button>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="left-3 bg-black/30 border-0 text-white hover:bg-black/50 hover:text-white" />
                    <CarouselNext className="right-3 bg-black/30 border-0 text-white hover:bg-black/50 hover:text-white" />
                  </Carousel>

                  {product.sold && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <div className="bg-[var(--brand-ink)]/80 text-[var(--brand-accent)] text-sm uppercase tracking-[0.3em] font-sans px-6 py-3 backdrop-blur-sm border border-[var(--brand-accent)]/40">
                        {t("product.sold")}
                      </div>
                    </div>
                  )}

                  {/* Dot indicators */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                    {allImages.map((_, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => carouselApi?.scrollTo(i)}
                        className={`h-1.5 rounded-full transition-all duration-200 ${
                          i === activeIdx ? "bg-[var(--brand-accent)] w-5" : "bg-white/50 hover:bg-white/80 w-1.5"
                        }`}
                        aria-label={`Go to image ${i + 1}`}
                      />
                    ))}
                  </div>

                  {/* Image counter */}
                  <div className="absolute top-4 left-4 z-10 bg-black/30 text-white text-[10px] font-sans px-2.5 py-1 backdrop-blur-sm">
                    {activeIdx + 1} / {total}
                  </div>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center" itemScope itemType="https://schema.org/Product">
              <meta itemProp="name" content={displayName} />
              <meta itemProp="description" content={displayDescription} />
              <meta itemProp="sku" content={`SKU-${product.id}`} />
              <link itemProp="image" href={allImages[0]?.imageUrl ?? ""} />
              <div itemProp="brand" itemScope itemType="https://schema.org/Brand">
                <meta itemProp="name" content={branding.storeName} />
              </div>
              <div itemProp="offers" itemScope itemType="https://schema.org/Offer">
                <meta itemProp="priceCurrency" content={currencyCode} />
                <meta itemProp="price" content={Number(product.price).toFixed(2)} />
                <meta itemProp="availability" content={product.sold ? "https://schema.org/OutOfStock" : "https://schema.org/InStock"} />
                <link itemProp="url" href={productUrl} />
              </div>

              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h2 className="font-serif text-foreground text-2xl md:text-3xl leading-tight" itemProp="name">
                  {displayName}
                </h2>
                {product.sold && (
                  <span className="text-[10px] uppercase tracking-[0.25em] font-sans text-amber-700 bg-amber-50 px-2 py-1 border border-amber-200">
                    {t("product.sold")}
                  </span>
                )}
              </div>

              <div className="divider-gold my-5" />

              <p className="text-muted-foreground text-sm font-sans leading-relaxed mb-6">
                {displayDescription}
              </p>

              <p className={`font-serif text-3xl mb-8 ${product.sold ? "text-muted-foreground line-through" : "text-[var(--brand-ink)]"}`}>
                {currencyCode} {Number(product.price).toFixed(2)}
              </p>

              {product.sold ? (
                <div className="flex flex-col gap-3">
                  <div className="inline-flex items-center justify-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 px-8 py-3.5 text-sm uppercase tracking-[0.1em] font-sans">
                    {t("product.sold")}
                  </div>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[#1ebe5d] transition-colors duration-200"
                    >
                      <WhatsAppIcon />
                      {t("product.enquireWhatsApp")}
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {inCart ? (
                    <button
                      type="button"
                      onClick={openCart}
                      className="inline-flex items-center justify-center gap-2 bg-[var(--brand-ink)] text-[var(--brand-accent)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors duration-200"
                    >
                      <Check size={16} />
                      {t("product.inBag")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="inline-flex items-center justify-center gap-2 bg-[var(--brand-ink)] text-[var(--brand-accent)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors duration-200"
                    >
                      <ShoppingBag size={16} />
                      {t("product.addToBag")}
                    </button>
                  )}
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 bg-white border border-[#25D366] text-[#1ebe5d] px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[#25D366] hover:text-white transition-colors duration-200"
                    >
                      <WhatsAppIcon />
                      {t("product.enquireWhatsApp")}
                    </a>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-4 font-sans text-center">
                {t("product.uniqueCaption")}
              </p>

              {/* Back to shop */}
              <div className="mt-10 pt-6 border-t border-[var(--brand-border)]">
                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 text-sm text-[var(--brand-ink)] font-sans hover:text-[var(--brand-accent)] transition-colors"
                >
                  <ArrowLeft size={14} />
                  Back to Shop
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

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
    </div>
  );
}
