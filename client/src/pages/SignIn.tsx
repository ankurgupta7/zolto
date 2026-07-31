/**
 * /signin on the STOREFRONT surface — the destination for every "you need to
 * sign in" moment inside a store's admin (an expired session, a 401 from the
 * API, an auth guard on a deep link).
 *
 * Distinct from marketing/pages/SignIn.tsx, which serves the same path on the
 * marketing surface: that one is a bounce page whose job is to find the
 * merchant's store and drop them in its admin. This one already knows where
 * the visitor was — `?next=` carries it — so it just offers the sign-in
 * methods and returns them to exactly the page they were on.
 */
import { useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { hardRedirect } from "@/lib/navigate";
import { sanitizeNextUrl } from "@/lib/nextUrl";
import { SignInOptions } from "@/components/SignInOptions";

export default function SignIn() {
  const search = useSearch();

  // Absolute, same-origin, and checked — `next` is attacker-controllable and
  // is acted on directly below (see lib/nextUrl).
  const next = useMemo(() => {
    const origin = window.location.origin;
    return (
      sanitizeNextUrl(new URLSearchParams(search).get("next"), origin) ??
      `${origin}/admin`
    );
  }, [search]);

  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const signedIn = !!me.data;

  // Already signed in (e.g. a second tab completed the handshake, or the
  // session was fine all along) — straight back to where they were. `replace`
  // so this page never sits in the back stack.
  useEffect(() => {
    if (!signedIn) return;
    hardRedirect(next, { replace: true });
  }, [signedIn, next]);

  if (me.isLoading || signedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-20">
        <Loader2
          className="animate-spin text-[var(--brand-ink)]"
          size={32}
          aria-label="Signing you in"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background pt-20">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="mb-6 font-serif text-5xl text-[var(--brand-accent)]/30">
          ◇
        </div>
        <h1 className="mb-3 font-serif text-2xl text-foreground">
          Sign in to continue
        </h1>
        <p className="mb-8 font-sans text-sm text-muted-foreground">
          Your session has ended. Sign in and we&rsquo;ll take you back to what
          you were doing.
        </p>
        <SignInOptions className="text-left" next={next} />
      </div>
    </div>
  );
}
