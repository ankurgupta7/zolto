import { Link } from "wouter";
import type { ReactNode } from "react";

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

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--brand-border)] bg-[var(--brand-ground)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--brand-ink)] font-serif text-lg text-[var(--brand-accent)]">
            Z
          </span>
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
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-ink)] px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
          >
            Start free
          </Link>
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
