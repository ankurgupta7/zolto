import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import { Menu, Store } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { storeAdminUrl } from "@/lib/surface";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Container } from "./Container";

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
  { label: "Product", href: "/#product" },
  { label: "Who it's for", href: "/for" },
  { label: "Pricing", href: "/pricing" },
  { label: "Compare", href: "/compare" },
  { label: "FAQ", href: "/faq" },
  { label: "Launch Diary", href: "/blog" },
];

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
      <span className="hidden sm:inline">Go to your store</span>
      <span className="sm:hidden">My store</span>
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
  const me = trpc.auth.me.useQuery(undefined, { retry: false });

  if (me.isLoading) return <AuthSlotSkeleton />;
  if (me.data) return <StoreShortcut />;

  return (
    <>
      {!compact && (
        <Link
          href={SIGN_IN_PATH}
          className="text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]"
        >
          Sign in
        </Link>
      )}
      <Link
        href="/signup"
        className="rounded-md bg-[var(--brand-ink)] px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
      >
        Start free
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
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        aria-label="Open menu"
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
            Menu
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
              {item.label}
            </Link>
          ))}
          {!me.isLoading && !me.data && (
            <Link
              href={SIGN_IN_PATH}
              onClick={close}
              className="border-b border-[var(--brand-border)] py-3.5 text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]"
            >
              Sign in
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function MarketingNav() {
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
        <nav aria-label="Main" className="hidden items-center gap-6 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)]"
            >
              {item.label}
            </Link>
          ))}
          <AuthActions />
        </nav>

        {/* Mobile — CTA stays in the bar, links move into the sheet */}
        <div className="flex items-center gap-2 sm:hidden">
          <AuthActions compact />
          <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </Container>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <Container className="flex flex-col gap-4 py-10 text-sm text-[var(--brand-muted-2)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} Zolto — commerce for makers, handmade in
          Zürich.
        </p>
        <nav className="flex gap-6">
          <Link href="/pricing" className="hover:text-[var(--brand-ink)]">
            Pricing
          </Link>
          <Link href="/faq" className="hover:text-[var(--brand-ink)]">
            FAQ
          </Link>
          <Link href="/legal/privacy" className="hover:text-[var(--brand-ink)]">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-[var(--brand-ink)]">
            Terms
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
