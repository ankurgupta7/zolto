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
import { SignOutButton } from "@/components/SignOutButton";
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
function NotTheOperator({ email }: { email: string | null }) {
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

      {email ? (
        <>
          {/* Naming the account is the whole point: the operator arriving here
              is usually signed in as the wrong one, and without this they
              cannot tell that is what happened. */}
          <p className="mt-4 text-xs text-muted-foreground">
            You are signed in as{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <SignOutButton
              to="/signin"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Sign in as someone else
            </SignOutButton>
            <a
              href="/"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Back to zolto.ch
            </a>
          </div>
        </>
      ) : (
        <a
          href="/signin?next=/platform"
          className="mt-6 inline-block text-sm font-medium text-primary underline underline-offset-4"
        >
          Sign in
        </a>
      )}
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
    return (
      <NotTheOperator email={user ? (user.email ?? "this account") : null} />
    );
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
            <div className="flex items-center gap-3">
              {user.email && (
                <span className="hidden max-w-[24ch] truncate text-xs text-muted-foreground sm:inline">
                  {user.email}
                </span>
              )}
              <a
                href="/"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                zolto.ch
              </a>
              <SignOutButton className="text-xs text-muted-foreground hover:text-foreground" />
            </div>
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
