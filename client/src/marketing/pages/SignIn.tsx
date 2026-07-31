import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { storeAdminUrl } from "@/lib/surface";
import { hardRedirect } from "@/lib/navigate";
import { Container } from "../components/Container";

/**
 * /signin — the returning merchant's front door.
 *
 * This is a bounce page, not a form: it exists so "Sign in" has one predictable
 * destination that ends at the merchant's own admin. The chain is
 *
 *   /signin → (OAuth if needed) → /signin → {slug}.zolto.ch/admin
 *
 * Both hops are full-page navigations (see lib/navigate): the OAuth handshake is
 * a server route, and the admin lives on the storefront surface, which the app
 * only resolves at mount. Both use history *replace*, so this page never sits in
 * the back stack — pressing Back from the admin returns the merchant to the page
 * they started from rather than bouncing them through the redirect again.
 *
 * Why not redirect from the nav directly: the slug isn't known until `myStore`
 * resolves, which needs an authenticated session. Only a post-login page can
 * make that second hop.
 */

/**
 * Marks the return leg of the OAuth round-trip. If we come back still
 * unauthenticated, the handshake failed — show that instead of bouncing to the
 * provider again, which would spin.
 */
const OAUTH_RETURN_MARK = "from=oauth";

export const SIGNIN_RETURN_PATH = `/signin?${OAUTH_RETURN_MARK}`;

export default function SignIn() {
  const search = useSearch();
  const returnedFromOauth = useMemo(
    () => new URLSearchParams(search).get("from") === "oauth",
    [search],
  );

  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const signedIn = !!me.data;

  const store = trpc.tenant.myStore.useQuery(undefined, {
    retry: false,
    enabled: signedIn,
  });

  // Leg 1 — not signed in yet: hand off to the identity provider.
  useEffect(() => {
    if (me.isLoading || signedIn || returnedFromOauth) return;
    hardRedirect(getLoginUrl(SIGNIN_RETURN_PATH), { replace: true });
  }, [me.isLoading, signedIn, returnedFromOauth]);

  // Leg 2 — signed in and the store is known: straight into its admin.
  useEffect(() => {
    if (!signedIn || !store.data) return;
    hardRedirect(storeAdminUrl(store.data.slug), { replace: true });
  }, [signedIn, store.data]);

  // Signed in, but this account isn't attached to a store. Not an error — it's
  // how a visitor who signed in before creating anything arrives here.
  if (signedIn && !store.isLoading && !store.data) {
    return (
      <SignInFrame title="You're signed in.">
        <p className="mt-3 text-[var(--brand-muted-2)]">
          This account isn&rsquo;t attached to a store yet. Create one and
          it&rsquo;ll be waiting here next time.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
        >
          Create your store →
        </Link>
      </SignInFrame>
    );
  }

  // Came back from the provider without a session — the handshake failed.
  if (returnedFromOauth && !me.isLoading && !signedIn) {
    return (
      <SignInFrame title={<>We couldn&rsquo;t sign you in.</>}>
        <p className="mt-3 text-[var(--brand-muted-2)]">
          The sign-in didn&rsquo;t complete. This usually means the browser is
          blocking cookies — private windows and strict tracking protection stop
          the session from being saved.
        </p>
        <a
          href={getLoginUrl(SIGNIN_RETURN_PATH)}
          className="mt-8 inline-block rounded-md bg-[var(--brand-ink)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
        >
          Try again
        </a>
        <p className="mt-6 text-sm text-[var(--brand-muted)]">
          Don&rsquo;t have a store yet?{" "}
          <Link href="/signup" className="text-[var(--brand-accent)] underline">
            Create one
          </Link>
          .
        </p>
      </SignInFrame>
    );
  }

  // Every other state is a hop in flight (auth resolving, provider handoff,
  // store lookup, admin redirect) — one steady message rather than a flicker
  // through three different ones.
  return (
    <SignInFrame title="Signing you in…">
      <p className="mt-3 text-[var(--brand-muted-2)]">
        {signedIn && store.data
          ? `Taking you to ${store.data.name}.`
          : "One moment — we're taking you to your store."}
      </p>
      <span
        aria-hidden
        data-testid="signin-progress"
        className="mt-8 block h-1 w-32 overflow-hidden rounded-full bg-[var(--brand-surface)]"
      >
        <span className="block h-full w-1/2 rounded-full bg-[var(--brand-accent)]" />
      </span>
    </SignInFrame>
  );
}

function SignInFrame({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Container width="md" className="py-32">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        welcome back
      </p>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
        {title}
      </h1>
      {children}
    </Container>
  );
}
