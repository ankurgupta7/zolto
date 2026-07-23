import { Link } from "wouter";
import type { ReactNode } from "react";

/**
 * Zolto marketing chrome — nav + footer with Zolto's own identity (slate + violet,
 * per business-plan §10.3), deliberately distinct from the warm storefront theme.
 */

const NAV = [
  { label: "Product", href: "/#product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Launch Diary", href: "/blog" },
  { label: "Sign in", href: "/signup" },
];

/**
 * The Zolto brush-Z mark (matches /favicon.svg + /logo.png). Cream stroke with a
 * violet accent dot, tuned for the dark marketing chrome. Inline so it inherits
 * crisp rendering at any size.
 */
export function BrushMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="8 34 184 132"
      className={className}
      role="img"
      aria-label="Zolto"
    >
      <path
        d="M50 54 C70 50 132 50 150 54 C150 66 120 70 96 84 C78 95 66 110 58 130 C74 138 132 132 152 138 C150 150 120 152 96 150 C74 148 52 150 46 140 C48 120 70 100 96 84 C70 74 54 70 50 54 Z"
        fill="#f4efe6"
      />
      <circle cx="163" cy="60" r="6" fill="#a78bfa" />
    </svg>
  );
}

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <BrushMark className="h-8 w-auto" />
          <span className="font-serif text-2xl font-medium tracking-tight text-white">
            Zolto
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-slate-300 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/signup"
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400"
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
    <footer className="border-t border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Zolto — AI-run commerce for makers.</p>
        <nav className="flex gap-6">
          <Link href="/pricing" className="hover:text-white">
            Pricing
          </Link>
          <Link href="/legal/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-white">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
