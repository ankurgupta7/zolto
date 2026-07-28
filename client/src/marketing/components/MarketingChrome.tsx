import { Link } from "wouter";
import type { ReactNode } from "react";
import { Store } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { storeAdminUrl } from "@/lib/surface";

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
  { label: "Pricing", href: "/pricing" },
  { label: "Launch Diary", href: "/blog" },
  { label: "Sign in", href: "/signup" },
];

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

export function MarketingNav() {
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const signedIn = !!me.data;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--brand-border)] bg-[var(--brand-ground)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <BrushMark className="h-8 w-8" />
          <span className="font-serif text-xl tracking-tight text-[var(--brand-text)]">
            Zolto
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hidden text-sm text-[var(--brand-muted-2)] transition-colors hover:text-[var(--brand-ink)] sm:inline"
            >
              {item.label}
            </Link>
          ))}
          {signedIn ? (
            <StoreShortcut />
          ) : (
            <Link
              href="/signup"
              className="rounded-md bg-[var(--brand-ink)] px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
            >
              Start free
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-[var(--brand-muted-2)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} Zolto — commerce for makers, handmade in
          Zürich.
        </p>
        <nav className="flex gap-6">
          <Link href="/pricing" className="hover:text-[var(--brand-ink)]">
            Pricing
          </Link>
          <Link href="/legal/privacy" className="hover:text-[var(--brand-ink)]">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-[var(--brand-ink)]">
            Terms
          </Link>
        </nav>
      </div>
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
