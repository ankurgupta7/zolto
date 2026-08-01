/**
 * The operator console shell — Zolto's own back office at zolto.ch/platform.
 *
 * Why this exists rather than a page in the merchant sidebar: admin routes are
 * mounted inside StorefrontRouter, which only renders on a tenant host, so the
 * platform owner previously had to visit some merchant's subdomain to read
 * their own business's numbers. This shell hangs off the marketing surface
 * instead, where the platform owner actually starts.
 *
 * The role check here is presentation only — every procedure behind these
 * pages is `superadminProcedure` server-side.
 */

import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import * as icons from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { PLATFORM_NAV, activePlatformNavId } from "./nav";

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Component =
    (icons as unknown as Record<string, icons.LucideIcon>)[name] ??
    icons.Circle;
  return <Component className={className} aria-hidden="true" />;
}

/**
 * Shown to anyone who is not the platform owner. Deliberately says nothing
 * about what the console contains or whether it exists for anyone else — a
 * signed-in merchant who guesses the URL learns only that it isn't theirs.
 */
function NotTheOperator({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <icons.Lock
        className="mx-auto h-8 w-8 text-muted-foreground"
        aria-hidden="true"
      />
      <h1 className="mt-4 text-lg font-semibold text-foreground">
        Not available
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This area belongs to the Zolto operator.
      </p>
      <a
        href={signedIn ? "/" : "/signin?next=/platform"}
        className="mt-6 inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        {signedIn ? "Back to zolto.ch" : "Sign in"}
      </a>
    </div>
  );
}

export function PlatformLayout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const activeId = activePlatformNavId(location);

  useEffect(() => {
    if (title) document.title = `${title} · Zolto operator`;
  }, [title]);

  if (loading) {
    return (
      <div className="px-4 py-24 text-center text-sm text-muted-foreground">
        Checking your access…
      </div>
    );
  }

  if (user?.role !== "superadmin") {
    return <NotTheOperator signedIn={Boolean(user)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <icons.Command
                className="h-5 w-5 text-primary"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Zolto operator
              </span>
            </div>
            <a
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              zolto.ch
            </a>
          </div>

          <nav aria-label="Operator console" className="flex gap-1">
            {PLATFORM_NAV.map((item) => {
              const isActive = item.id === activeId;
              return (
                <Link
                  key={item.id}
                  href={item.path}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {/* The pages render their own visible headings as <h2> (PageHeader),
            so the document's single <h1> belongs here. */}
        {title && <h1 className="sr-only">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

export default PlatformLayout;
