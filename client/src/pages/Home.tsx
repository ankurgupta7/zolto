import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import ProductCard from "@/components/ProductCard";
import ParticleField from "@/components/ParticleField";
import CustomerTrust from "@/components/CustomerTrust";
import { useTenant } from "@/contexts/TenantContext";
import { instagramHref } from "@/lib/branding";
import { heroCopy, valueProps, pageChrome } from "@/lib/storefrontContent";
import { useTranslation } from "react-i18next";
import { matchSupportedLanguage } from "@/lib/languages";
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
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
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
  const { branding, content } = useTenant();
  const { i18n } = useTranslation();
  const lang = matchSupportedLanguage(i18n.language) ?? "en";
  const { data: products } = trpc.products.list.useQuery({});
  const featured = products?.slice(0, 6) ?? [];
  const hero = heroCopy(branding, lang, content);
  const pillars = valueProps(lang);
  const chrome = pageChrome(branding, lang).home;
  const igHref = instagramHref(branding);

  // Categories are derived from the tenant's own catalogue — no hardcoded list,
  // so a store only ever shows the categories it actually stocks.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const p of products ?? []) if (p.category) seen.add(p.category);
    return Array.from(seen);
  }, [products]);

  const heroRef = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();

  const rawHeroY = useTransform(scrollY, [0, 800], [0, 160]);
  const heroY = useSpring(rawHeroY, { stiffness: 60, damping: 20 });
  const heroContentOpacity = useTransform(scrollY, [0, 360], [1, 0]);
  const heroContentY = useTransform(scrollY, [0, 360], [0, 40]);
  const scrollIndicatorOpacity = useTransform(scrollY, [0, 180], [1, 0]);

  return (
    <>
      {/* Ambient gold-dust layer spanning the whole page. Mounted outside
          `.page-enter` because that wrapper animates a transform, which would
          otherwise become the containing block for this fixed canvas. */}
      <ParticleField />
      <div className="page-enter">
        {/* ── Hero ─────────────────────────────────────────────────────────────── */}
        <section
          ref={heroRef}
          className="relative min-h-screen flex items-center overflow-hidden pt-24"
        >
          <motion.div
            style={{ y: heroY }}
            className="absolute inset-0 will-change-transform"
            aria-hidden="true"
          >
            <img
              src={hero.imageUrl}
              alt=""
              className="w-full h-full object-cover object-center scale-110"
              loading="eager"
            />
          </motion.div>

          <div className="absolute inset-0 bg-[var(--brand-ink)]/70 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--brand-ink)]/80 via-[var(--brand-ink)]/40 to-transparent pointer-events-none" />

          <motion.div
            style={{ opacity: heroContentOpacity, y: heroContentY }}
            className="container relative z-10 py-24"
          >
            <div className="max-w-2xl">
              <motion.p
                {...fadeUpProps(0.1)}
                className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-6 font-sans"
              >
                {hero.badge}
              </motion.p>
              <motion.h1
                {...fadeUpProps(0.22)}
                className="font-serif text-white mb-6 leading-[1.1]"
              >
                {hero.title}
              </motion.h1>
              <motion.p
                {...fadeUpProps(0.34)}
                className="text-white/60 text-lg mb-10 leading-relaxed max-w-lg font-sans font-light"
              >
                {hero.subtitle}
              </motion.p>
              <motion.div
                {...fadeUpProps(0.46)}
                className="flex flex-wrap gap-4"
              >
                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 bg-[var(--brand-accent)] text-[var(--brand-ink)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:bg-[var(--brand-accent-light)] transition-colors duration-300"
                >
                  {chrome.exploreShop}
                </Link>
                {igHref && (
                  <a
                    href={igHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 border border-white/30 text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] transition-colors duration-300"
                  >
                    <InstagramIcon />
                    {branding.instagramHandle
                      ? `@${branding.instagramHandle}`
                      : "Instagram"}
                  </a>
                )}
              </motion.div>
            </div>
          </motion.div>

          {/* Decoration, and the first thing to go when the hero gets tall:
              a merchant's own headline wraps to two or three lines on a phone,
              which pushes the CTAs down onto this label. Hidden below `sm`,
              where a full-bleed hero already invites a scroll without being
              told to. */}
          <motion.div
            style={{ opacity: scrollIndicatorOpacity }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-2 text-white/30"
          >
            <span className="text-[10px] uppercase tracking-[0.2em] font-sans">
              {chrome.scroll}
            </span>
            <motion.div
              animate={{ scaleY: [1, 1.35, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{
                duration: 1.9,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="w-px h-12 bg-gradient-to-b from-white/50 to-transparent origin-top"
            />
          </motion.div>
        </section>

        {/* ── Value props ────────────────────────────────────────────────────────── */}
        <section className="py-20 bg-[var(--brand-surface)] overflow-hidden">
          <div className="container">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {pillars.map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_OPTS}
                  transition={{
                    duration: 0.75,
                    ease: EASE_VISCOUS,
                    delay: i * 0.12,
                  }}
                  className="text-center py-8 px-4 bg-white border border-[var(--brand-border)]"
                >
                  <div className="text-2xl text-[var(--brand-accent)] font-serif mb-3">
                    {p.icon}
                  </div>
                  <p className="font-serif text-foreground text-lg mb-1">
                    {p.title}
                  </p>
                  <p className="text-muted-foreground text-xs font-sans uppercase tracking-[0.12em]">
                    {p.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Category strip (derived from the catalogue) ────────────────────────── */}
        {categories.length > 0 && (
          <section className="py-8 bg-background border-b border-[var(--brand-border)] overflow-hidden">
            <div className="container">
              <div className="flex items-center gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <motion.span
                  {...fadeInProps(0)}
                  className="text-[var(--brand-accent)] text-[10px] uppercase tracking-[0.25em] font-sans whitespace-nowrap shrink-0 mr-1"
                >
                  {chrome.shopByCategory}
                </motion.span>
                {categories.map((cat, i) => (
                  <motion.div
                    key={cat}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VIEWPORT_OPTS}
                    transition={{
                      duration: 0.6,
                      ease: EASE_VISCOUS,
                      delay: (i + 1) * 0.1,
                    }}
                  >
                    <Link
                      href={`/shop?category=${encodeURIComponent(cat)}`}
                      className="group inline-flex items-center gap-2 bg-[var(--brand-ink)] text-white hover:bg-[var(--brand-ink-hover)] transition-colors duration-300 px-5 py-2.5 text-xs font-sans uppercase tracking-[0.12em] whitespace-nowrap shrink-0"
                    >
                      {cat}
                      <span className="text-[var(--brand-accent)]/60 group-hover:text-[var(--brand-accent)] transition-colors">
                        →
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Featured products ──────────────────────────────────────────────────── */}
        {featured.length > 0 && (
          <section className="py-16 bg-[var(--brand-surface)] overflow-hidden">
            <div className="container">
              <div className="flex items-end justify-between mb-10">
                <motion.div
                  initial={{ opacity: 0, x: -32 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={VIEWPORT_OPTS}
                  transition={{ duration: 0.9, ease: EASE_VISCOUS }}
                >
                  <motion.p
                    {...fadeUpProps(0.05)}
                    className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans"
                  >
                    {chrome.latestArrivals}
                  </motion.p>
                  <motion.h2
                    {...fadeUpProps(0.15)}
                    className="font-serif text-foreground"
                  >
                    {chrome.newInShop}
                  </motion.h2>
                </motion.div>
                <motion.div {...fadeInProps(0.25)}>
                  <Link
                    href="/shop"
                    className="inline-flex items-center gap-2 text-sm text-[var(--brand-ink)] uppercase tracking-[0.15em] font-sans hover:text-[var(--brand-accent)] transition-colors border-b border-[var(--brand-ink)]/30 hover:border-[var(--brand-accent)] pb-0.5"
                  >
                    {chrome.viewAll}
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
                      <CarouselItem
                        key={product.id}
                        className="basis-1/2 lg:basis-1/4"
                      >
                        <ProductCard product={product} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="hidden sm:flex bg-white border-[var(--brand-accent)]/40 text-[var(--brand-ink)] hover:bg-[var(--brand-surface)] hover:border-[var(--brand-accent)]" />
                  <CarouselNext className="hidden sm:flex bg-white border-[var(--brand-accent)]/40 text-[var(--brand-ink)] hover:bg-[var(--brand-surface)] hover:border-[var(--brand-accent)]" />
                </Carousel>
              </motion.div>
            </div>
          </section>
        )}

        {/* ── What other people say ──────────────────────────────────────────
            Last thing on the page, on purpose: a shopper who has scrolled past
            the hero, the story and the new arrivals is deciding whether to
            trust the shop, and this is the answer to that question. Renders
            nothing for a store with no quotes and no Trustpilot profile. */}
        <CustomerTrust />
      </div>
    </>
  );
}
