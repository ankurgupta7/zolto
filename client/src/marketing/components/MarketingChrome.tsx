import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import { Menu, Store } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { storeAdminUrl } from "@/lib/surface";
import { DATA_RESIDENCY, SOVEREIGNTY } from "@shared/platform";
import { SignOutButton } from "@/components/SignOutButton";
import i18n from "@/lib/i18n";
import {
  DEFAULT_LANGUAGE,
  HTML_LANG,
  SUPPORTED_LANGUAGES,
  matchSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/languages";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Container } from "./Container";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * Zolto marketing chrome — nav + footer.
 *
 * Warm, handcrafted identity: the oyster/gold/ink + Cormorant serif palette the
 * makers' own storefronts use, so the acquisition page looks like it was built
 * for craftspeople rather than a generic dev tool — and stays coherent with the
 * product a visitor is about to build. Serif + gold carry the brand; the pen
 * (see MarketingIllustrations) stays off prices, payment claims, and CTAs.
 */

const NAV = [
  { key: "product", href: "/#product" },
  { key: "whoItsFor", href: "/for" },
  { key: "pricing", href: "/pricing" },
  { key: "compare", href: "/compare" },
  // Short label on purpose ("Swiss-made"): the bar already carries six links
  // plus the auth slot, and the spelled-out claim pushes it into a wrap at
  // laptop widths. The page it points at says the whole thing.
  { key: "swissMade", href: SOVEREIGNTY.href },
  { key: "faq", href: "/faq" },
  { key: "launchDiary", href: "/blog" },
] as const;

/**
 * The marketing language picker — the same mechanism as the storefront's
 * (Navbar.tsx): persist to the shared "kalakosh_lang" key, switch the global
 * i18next instance, and keep <html lang> truthful. Styled for the marketing
 * chrome rather than the storefront's.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n: i18nInst } = useMarketingT();
  const currentLang =
    matchSupportedLanguage(i18nInst.language) ?? DEFAULT_LANGUAGE;

  const switchTo = (next: SupportedLanguage) => {
    i18n.changeLanguage(next);
    localStorage.setItem("kalakosh_lang", next);
    document.documentElement.lang = HTML_LANG[next];
  };

  return (
    <select
      value={currentLang}
      onChange={(e) => switchTo(e.target.value as SupportedLanguage)}
      aria-label="Switch language"
      className={`cursor-pointer appearance-none rounded-md border border-[var(--brand-border)] bg-transparent px-2 py-1 text-xs font-medium uppercase tracking-[0.15em] text-[var(--brand-muted-2)] transition-colors hover:border-[var(--brand-ink)]/40 hover:text-[var(--brand-ink)] ${className}`}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang} className="text-black">
          {lang.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

/**
 * Sign-in target for a *returning* merchant.
 *
 * Deliberately not /signup: that page only creates a brand-new tenant, so
 * sending an existing merchant there offers them a second store rather than a
 * way back into the one they have. /signin is a bounce page that runs the OAuth
 * handshake and then drops them straight into their own store admin — see
 * pages/SignIn.tsx for why that second hop can't happen from here.
 */
export const SIGN_IN_PATH = "/signin";

/**
 * The Zolto brush-Z mark — the signature gold-on-mahogany lockup (matches
 * /favicon.svg + /logo.png). A near-square mahogany tile with a hand-inked gold
 * "Z"; reads at 16px. Inline so it stays crisp at any size.
 */
export function BrushMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Zolto"
    >
      <rect width="200" height="200" rx="20" fill="#2D2620" />
      <path
        d="M50 54 C70 50 132 50 150 54 C150 66 120 70 96 84 C78 95 66 110 58 130 C74 138 132 132 152 138 C150 150 120 152 96 150 C74 148 52 150 46 140 C48 120 70 100 96 84 C70 74 54 70 50 54 Z"
        fill="#B8963E"
      />
      <circle cx="163" cy="60" r="6.5" fill="#F0EBE3" />
    </svg>
  );
}

/**
 * Placeholder that reserves the auth slot's footprint while auth resolves, so
 * the bar doesn't reflow (and signed-in merchants don't see "Start free" flash
 * before it swaps to "Go to your store").
 */
function AuthSlotSkeleton() {
  return (
    <span
      aria-hidden
      data-testid="auth-slot-loading"
      className="h-9 w-28 rounded-md bg-[var(--brand-border)]/60"
    />
  );
}

/**
 * "Go to your store" shortcut — for a signed-in merchant who lands back on the
 * marketing site (zolto.ch) and has forgotten their store's address. Uses the
 * host-independent tenant.myStore, and a real anchor (not a wouter <Link>) so
 * the browser crosses from the marketing surface to the storefront/admin
 * (see lib/surface.storeAdminUrl). Renders nothing for logged-out visitors, so
 * the acquisition CTA is unchanged for them.
 */
export function StoreShortcut() {
  const { t } = useMarketingT();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const store = trpc.tenant.myStore.useQuery(undefined, {
    retry: false,
    enabled: !!me.data,
  });

  // Signed in but the store lookup is still in flight — hold the slot instead of
  // rendering nothing and popping the button in a moment later.
  if (me.data && store.isLoading) return <AuthSlotSkeleton />;
  if (!me.data || !store.data) return null;

  return (
    <a
      href={storeAdminUrl(store.data.slug)}
      className="inline-flex items-center gap-2 rounded-md bg-[var(--brand-ink)] px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
    >
      <Store className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{t("nav.goToYourStore")}</span>
      <span className="sm:hidden">{t("nav.myStore")}</span>
    </a>
  );
}

/**
 * The nav's right-hand slot. Signed in → the store shortcut; signed out → sign
 * in + the acquisition CTA. While `auth.me` is in flight we render neither:
 * committing to "Start free" early makes the bar visibly flip for merchants who
 * are already signed in.
 *
 * `compact` is the in-bar mobile rendering: the CTA stays visible but the "Sign
 * in" text link moves into the sheet, where it has room to breathe.
 */
function AuthActions({ compact = false }: { compact?: boolean }) {
  const { t } = useMarketingT();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });

  if (me.isLoading) return <AuthSlotSkeleton />;

  // Signed in: say WHO, and offer the way out. Showing only "Go to your store"
  // left a visitor whose browser carried a Google session with no way to tell
  // which account they were, and no way to leave it.
  if (me.data) {
    return (
      <>
        {!compact && me.data.email && (
          <span
            className="hidden max-w-[16ch] truncate text-sm text-[var(--brand-muted-2)] lg:inline"
            title={me.data.email}
          >
            {me.data.email}
          </span>
        )}
        <StoreShortcut />
        {!compact && (
          <SignOutButton className="text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]" />
        )}
      </>
    );
  }

  return (
    <>
      {!compact && (
        <Link
          href={SIGN_IN_PATH}
          className="text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]"
        >
          {t("nav.signIn")}
        </Link>
      )}
      <Link
        href="/signup"
        className="rounded-md bg-[var(--brand-ink)] px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
      >
        {t("nav.startFree")}
      </Link>
    </>
  );
}

/**
 * Mobile navigation. Without this the nav links are simply unreachable on a
 * phone (they were `hidden … sm:inline`), which on a maker-facing site is the
 * majority of traffic. A Radix-backed sheet buys focus trapping, escape-to-close
 * and the dialog aria semantics rather than re-implementing them.
 */
function MobileMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useMarketingT();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        aria-label={t("nav.openMenu")}
        className="-mr-1 inline-flex items-center justify-center rounded-md p-2 text-[var(--brand-text)]/70 transition-colors hover:text-[var(--brand-ink)]"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(20rem,85vw)] border-l-[var(--brand-border)] bg-[var(--brand-ground)]"
      >
        <SheetHeader>
          <SheetTitle className="font-serif text-lg font-normal text-[var(--brand-text)]">
            {t("nav.menu")}
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col px-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className="border-b border-[var(--brand-border)] py-3.5 text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
          {!me.isLoading && !me.data && (
            <Link
              href={SIGN_IN_PATH}
              onClick={close}
              className="border-b border-[var(--brand-border)] py-3.5 text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]"
            >
              {t("nav.signIn")}
            </Link>
          )}
          {/* The drawer is the only place a phone can reach this — the in-bar
              mobile rendering is `compact` and shows the CTA alone. */}
          {!me.isLoading && me.data && (
            <div className="border-b border-[var(--brand-border)] py-3.5">
              {me.data.email && (
                <p className="truncate text-xs text-[var(--brand-muted)]">
                  {t("nav.signedInAs", { email: me.data.email })}
                </p>
              )}
              <SignOutButton className="mt-1 text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]" />
            </div>
          )}
          {/* Language picker — the sheet is the only place a phone can reach it. */}
          <div className="py-3.5">
            <LanguageSwitcher />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function MarketingNav() {
  const { t } = useMarketingT();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the mobile sheet whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--brand-border)] bg-[var(--brand-ground)]/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrushMark className="h-8 w-8" />
          <span className="font-serif text-xl tracking-tight text-[var(--brand-text)]">
            Zolto
          </span>
        </Link>

        {/* Desktop */}
        {/* Desktop. The bar switches to the sheet at `lg`, not `sm`: seven
            links plus the logo and the auth slot need roughly 900px, so on a
            640–1023px tablet the row used to run off the edge — visibly, and
            before this nav item was added. */}
        <nav aria-label="Main" className="hidden items-center gap-5 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
          <LanguageSwitcher />
          <AuthActions />
        </nav>

        {/* Mobile — CTA stays in the bar, links move into the sheet */}
        <div className="flex items-center gap-2 lg:hidden">
          <AuthActions compact />
          <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </Container>
    </header>
  );
}

export function MarketingFooter() {
  const { t, st } = useMarketingT();
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <Container className="flex flex-col gap-4 py-10 text-sm text-[var(--brand-muted-2)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          {/* Origin + residency, in the one place every page carries. The
              countries come from SOVEREIGNTY/DATA_RESIDENCY so the footer can't
              drift from the landing band, the ledger page or the policy. */}
          <p className="mt-1.5 text-[13px] text-[var(--brand-muted)]">
            {t("footer.madeIn", {
              headline: st("sovereignty.headline", SOVEREIGNTY.headline),
              region: st("dataResidency.region", DATA_RESIDENCY.region),
              country: st(
                "dataResidency.primaryCountry",
                DATA_RESIDENCY.primaryCountry,
              ),
            })}{" "}
            <Link
              href={SOVEREIGNTY.href}
              className="underline decoration-[var(--brand-accent)] underline-offset-2 hover:text-[var(--brand-ink)]"
            >
              {t("footer.whatRunsWhere")}
            </Link>
            .
          </p>
        </div>
        <nav className="flex gap-6">
          <Link href="/pricing" className="hover:text-[var(--brand-ink)]">
            {t("footer.pricing")}
          </Link>
          <Link href="/faq" className="hover:text-[var(--brand-ink)]">
            {t("footer.faq")}
          </Link>
          <Link href="/legal/privacy" className="hover:text-[var(--brand-ink)]">
            {t("footer.privacy")}
          </Link>
          <Link href="/legal/terms" className="hover:text-[var(--brand-ink)]">
            {t("footer.terms")}
          </Link>
        </nav>
      </Container>
    </footer>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-ground)] font-sans text-[var(--brand-text)]">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
