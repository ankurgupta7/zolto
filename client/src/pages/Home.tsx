import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import ProductCard from "@/components/ProductCard";
import { useTranslation } from "react-i18next";
import type { ProductCategory } from "@shared/types";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef, useMemo } from "react";

const InstagramIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

/* Shared easing curve — approximates the feeling of pushing through thick liquid */
const EASE_VISCOUS = [0.22, 1, 0.36, 1] as const;
const VIEWPORT_OPTS = { once: true, margin: "-80px" } as const;

function fadeUpProps(delay = 0) {
  return {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: VIEWPORT_OPTS,
    transition: { duration: 0.85, ease: EASE_VISCOUS, delay },
  } as const;
}

function fadeInProps(delay = 0) {
  return {
    initial: { opacity: 0 },
    whileInView: { opacity: 1 },
    viewport: VIEWPORT_OPTS,
    transition: { duration: 0.9, ease: "easeOut" as const, delay },
  } as const;
}

export default function Home() {
  const { t } = useTranslation();
  const { data: products } = trpc.products.list.useQuery({});
  const featured = products?.slice(0, 6) ?? [];

  const availableCategories = useMemo(
    () => new Set(products?.map((p) => p.category) ?? []),
    [products]
  );

  const heroRef = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();

  /* Hero background drifts at ~30 % of scroll speed */
  const rawHeroY = useTransform(scrollY, [0, 800], [0, 160]);
  const heroY = useSpring(rawHeroY, { stiffness: 60, damping: 20 });

  /* Hero text content fades and rises as the user scrolls away */
  const heroContentOpacity = useTransform(scrollY, [0, 360], [1, 0]);
  const heroContentY = useTransform(scrollY, [0, 360], [0, 40]);

  /* Scroll-indicator vanishes early */
  const scrollIndicatorOpacity = useTransform(scrollY, [0, 180], [1, 0]);

  const CATEGORIES = [
    { key: "necklaces",        name: "Necklaces",         displayName: t("categories.necklaces"),        icon: "◎" },
    { key: "earrings",         name: "Earrings",           displayName: t("categories.earrings"),         icon: "◉" },
    { key: "sets",             name: "Sets",               displayName: t("categories.sets"),             icon: "✦" },
    { key: "rings",            name: "Rings",              displayName: t("categories.rings"),            icon: "○" },
    { key: "bracelets",        name: "Bracelets",          displayName: t("categories.bracelets"),        icon: "◈" },
    { key: "bangles",          name: "Bangles",            displayName: t("categories.bangles"),          icon: "◇" },
    { key: "anklets",          name: "Anklets",            displayName: t("categories.anklets"),          icon: "◆" },
    { key: "brooches",         name: "Brooches",           displayName: t("categories.brooches"),         icon: "✦" },
    { key: "hairAccessories",  name: "Hair Accessories",   displayName: t("categories.hairAccessories"),  icon: "✧" },
    { key: "other",            name: "Other",              displayName: t("categories.other"),            icon: "◻" },
  ];

  return (
    <div className="page-enter">

      {/* ── Hero ───────────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden pt-24">

        {/* Parallax background */}
        <motion.div
          style={{ y: heroY }}
          className="absolute inset-0 will-change-transform"
          aria-hidden="true"
        >
          <img
            src="/hero-bg.svg"
            alt=""
            className="w-full h-full object-cover object-center scale-110"
            loading="eager"
          />
        </motion.div>

        {/* Colour wash — static, above parallax */}
        <div className="absolute inset-0 bg-[#2D2620]/70 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#2D2620]/80 via-[#2D2620]/40 to-transparent pointer-events-none" />

        {/* Hero text — drifts and fades as user scrolls */}
        <motion.div
          style={{ opacity: heroContentOpacity, y: heroContentY }}
          className="container relative z-10 py-24"
        >
          <div className="max-w-2xl">
            <motion.p
              {...fadeUpProps(0.1)}
              className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-6 font-sans"
            >
              {t("home.badge")}
            </motion.p>
            <motion.h1
              {...fadeUpProps(0.22)}
              className="font-serif text-white mb-6 leading-[1.1]"
            >
              {t("home.heroTitle")}{" "}
              <span className="text-gold-gradient italic">{t("home.heroTitleItalic")}</span>
            </motion.h1>
            <motion.p
              {...fadeUpProps(0.34)}
              className="text-white/60 text-lg mb-10 leading-relaxed max-w-lg font-sans font-light"
            >
              {t("home.heroSubtitle")}
            </motion.p>
            <motion.div
              {...fadeUpProps(0.46)}
              className="flex flex-wrap gap-4"
            >
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 bg-[#B8963E] text-[#2D2620] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:bg-[#D4B060] transition-colors duration-300"
              >
                {t("home.exploreCollection")}
              </Link>
              <a
                href="https://www.instagram.com/kalakoshzurich"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-white/30 text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:border-[#B8963E] hover:text-[#B8963E] transition-colors duration-300"
              >
                <InstagramIcon />
                @kalakoshzurich
              </a>
            </motion.div>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          style={{ opacity: scrollIndicatorOpacity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30"
        >
          <span className="text-[10px] uppercase tracking-[0.2em] font-sans">{t("home.scroll")}</span>
          <motion.div
            animate={{ scaleY: [1, 1.35, 1], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
            className="w-px h-12 bg-gradient-to-b from-white/50 to-transparent origin-top"
          />
        </motion.div>
      </section>

      {/* ── Founder Story Strip ────────────────────────────────────────────────── */}
      <section className="py-20 bg-[#EDE7DF] overflow-hidden">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center max-w-5xl mx-auto">

            {/* Left: story text — slides in from left */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_OPTS}
              transition={{ duration: 1.0, ease: EASE_VISCOUS }}
            >
              <motion.p {...fadeUpProps(0)} className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-4 font-sans">
                {t("home.founderBadge")}
              </motion.p>
              <motion.h2 {...fadeUpProps(0.1)} className="font-serif text-foreground text-2xl md:text-3xl mb-6 leading-snug">
                {t("home.founderTitle")}
              </motion.h2>

              {/* Gold divider animates its width */}
              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={VIEWPORT_OPTS}
                transition={{ duration: 0.9, delay: 0.2, ease: EASE_VISCOUS }}
                style={{ originX: 0 }}
                className="divider-gold w-12 mb-6"
              />

              <motion.p {...fadeUpProps(0.2)} className="text-muted-foreground font-sans font-light leading-relaxed text-base mb-8">
                {t("home.founderText")}
              </motion.p>
              <motion.div {...fadeUpProps(0.3)}>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 text-sm text-[#2D2620] uppercase tracking-[0.15em] font-sans hover:text-[#B8963E] transition-colors border-b border-[#2D2620]/30 hover:border-[#B8963E] pb-0.5"
                >
                  {t("home.founderLink")} →
                </Link>
              </motion.div>
            </motion.div>

            {/* Right: three pillars — slide in from right, staggered */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_OPTS}
              transition={{ duration: 1.0, ease: EASE_VISCOUS }}
              className="grid grid-cols-3 gap-4"
            >
              {[
                { title: t("home.pillar1Title"), desc: t("home.pillar1Desc"), icon: "◈" },
                { title: t("home.pillar2Title"), desc: t("home.pillar2Desc"), icon: "◇" },
                { title: t("home.pillar3Title"), desc: t("home.pillar3Desc"), icon: "○" },
              ].map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_OPTS}
                  transition={{ duration: 0.75, ease: EASE_VISCOUS, delay: i * 0.12 }}
                  whileHover={{
                    y: -6,
                    boxShadow: "0 16px 40px rgba(26,74,46,0.10)",
                    transition: { duration: 0.4, ease: EASE_VISCOUS },
                  }}
                  className="text-center py-8 px-4 bg-white border border-[#E0D8CC]"
                >
                  <div className="text-2xl text-[#B8963E] font-serif mb-3">{p.icon}</div>
                  <p className="font-serif text-foreground text-lg mb-1">{p.title}</p>
                  <p className="text-muted-foreground text-xs font-sans uppercase tracking-[0.12em]">{p.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Collection Strip ───────────────────────────────────────────────────── */}
      <section className="py-8 bg-background border-b border-[#E0D8CC] overflow-hidden">
        <div className="container">
          <div className="flex items-center gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <motion.span
              {...fadeInProps(0)}
              className="text-[#B8963E] text-[10px] uppercase tracking-[0.25em] font-sans whitespace-nowrap shrink-0 mr-1"
            >
              {t("home.ourCollections")}
            </motion.span>
            {CATEGORIES.filter((cat) => availableCategories.has(cat.name as ProductCategory)).map((cat, i) => (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_OPTS}
                transition={{ duration: 0.6, ease: EASE_VISCOUS, delay: (i + 1) * 0.1 }}
              >
                <Link
                  href={`/shop?category=${encodeURIComponent(cat.name)}`}
                  className="group inline-flex items-center gap-2 bg-[#2D2620] text-white hover:bg-[#3A3028] transition-colors duration-300 px-5 py-2.5 text-xs font-sans uppercase tracking-[0.12em] whitespace-nowrap shrink-0"
                >
                  <span className="text-[#B8963E] font-serif text-base leading-none">{cat.icon}</span>
                  {cat.displayName}
                  <span className="text-[#B8963E]/60 group-hover:text-[#B8963E] transition-colors">→</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Products Carousel ─────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="py-16 bg-[#EDE7DF] overflow-hidden">
          <div className="container">
            <div className="flex items-end justify-between mb-10">
              <motion.div
                initial={{ opacity: 0, x: -32 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={VIEWPORT_OPTS}
                transition={{ duration: 0.9, ease: EASE_VISCOUS }}
              >
                <motion.p {...fadeUpProps(0.05)} className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
                  {t("home.latestArrivals")}
                </motion.p>
                <motion.h2 {...fadeUpProps(0.15)} className="font-serif text-foreground">
                  {t("home.newInCollection")}
                </motion.h2>
              </motion.div>
              <motion.div {...fadeInProps(0.25)}>
                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 text-sm text-[#2D2620] uppercase tracking-[0.15em] font-sans hover:text-[#B8963E] transition-colors border-b border-[#2D2620]/30 hover:border-[#B8963E] pb-0.5"
                >
                  {t("home.viewAll")}
                </Link>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_OPTS}
              transition={{ duration: 0.85, ease: EASE_VISCOUS, delay: 0.1 }}
              className="relative sm:px-12"
            >
              <Carousel opts={{ align: "start", loop: false }}>
                <CarouselContent>
                  {featured.map((product) => (
                    <CarouselItem key={product.id} className="basis-1/2 lg:basis-1/4">
                      <ProductCard product={product} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="hidden sm:flex bg-white border-[#B8963E]/40 text-[#2D2620] hover:bg-[#EDE7DF] hover:border-[#B8963E]" />
                <CarouselNext className="hidden sm:flex bg-white border-[#B8963E]/40 text-[#2D2620] hover:bg-[#EDE7DF] hover:border-[#B8963E]" />
              </Carousel>
            </motion.div>
          </div>
        </section>
      )}
    </div>
  );
}
