import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { Trans } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { storeAdminUrl } from "@/lib/surface";
import { hardRedirect } from "@/lib/navigate";
import { Container } from "../components/Container";
import { SignInOptions } from "@/components/SignInOptions";
import { SignOutButton } from "@/components/SignOutButton";
import { SIGNIN_PATH } from "@/const";
import { useMarketingT } from "../lib/marketingI18n";

/** Emphasis slot for the <Trans> sentences below (account email, store name). */
const strongText = <span className="font-medium text-[var(--brand-text)]" />;

/**
 * /signin — the returning merchant's front door.
 *
 * Not signed in yet, it offers every sign-in method (Google, Apple, email
 * magic link — see SignInOptions) and, once one completes, ends at the
 * merchant's own admin. The chain is
 *
 *   /signin → (identity provider) → /signin → {slug}.zolto.ch/admin
 *
 * The final hop is a full-page navigation (see lib/navigate): the admin lives
 * on the storefront surface, which the app only resolves at mount, and it uses
 * history *replace*, so this page never sits in the back stack — pressing Back
 * from the admin returns the merchant to the page they started from rather
 * than bouncing them through sign-in again.
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
  const { t } = useMarketingT();
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

  // A signed-in account with no store may still have an unclaimed signup
  // waiting for its email (the claim token lives only in the signup tab's
  // sessionStorage, so a failed sign-in or a new device loses it). Look it up
  // so this page can offer "finish setting up" instead of a dead end.
  const pendingEnabled = signedIn && !store.isLoading && !store.data;
  const pending = trpc.tenant.pendingClaim.useQuery(undefined, {
    retry: false,
    enabled: pendingEnabled,
  });
  const pendingResolving = pendingEnabled && pending.isLoading;
  const pendingStore = pendingEnabled ? (pending.data ?? null) : null;
  const finishSetupHref = (slug: string) =>
    `/onboarding?store=${encodeURIComponent(slug)}`;

  // Leg 2 — signed in and the store is known: straight into its admin.
  //
  // ONLY on the return leg of a handshake the visitor just performed. Arriving
  // here with a session that already existed is a different intent: they
  // clicked "Sign in" deliberately, and bouncing them onward silently means a
  // browser carrying somebody's Google session can never be used to sign in as
  // anyone else. That case falls through to the explicit choice below.
  useEffect(() => {
    if (!returnedFromOauth || !signedIn || !store.data) return;
    hardRedirect(storeAdminUrl(store.data.slug), { replace: true });
  }, [returnedFromOauth, signedIn, store.data]);

  // Already signed in, and they came here on purpose — offer both directions
  // rather than choosing for them.
  if (!returnedFromOauth && signedIn && !store.isLoading && !pendingResolving) {
    return (
      <SignInFrame title={t("signin.alreadyTitle")}>
        <p className="mt-3 text-[var(--brand-muted-2)]">
          <Trans
            t={t}
            i18nKey="signin.alreadyAs"
            values={{ email: me.data?.email ?? t("signin.thisAccount") }}
            components={{ hl: strongText }}
          />
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {store.data ? (
            <a
              href={storeAdminUrl(store.data.slug)}
              className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
            >
              {t("signin.continueTo", { store: store.data.name })}
            </a>
          ) : pendingStore ? (
            // An unclaimed signup matches this account's email — resuming it
            // beats offering a second signup that would only be refused.
            <Link
              href={finishSetupHref(pendingStore.slug)}
              className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
            >
              {t("signin.finishSetup", { store: pendingStore.name })}
            </Link>
          ) : (
            <Link
              href="/signup"
              className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
            >
              {t("signin.createStore")}
            </Link>
          )}
          <SignOutButton
            to={SIGNIN_PATH}
            className="rounded-md border border-[var(--brand-ink)] px-7 py-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            {t("signin.differentAccount")}
          </SignOutButton>
        </div>
      </SignInFrame>
    );
  }

  // Signed in, but this account isn't attached to a store. Not an error — it's
  // how a visitor who signed in before creating anything arrives here. If an
  // unclaimed signup matches this account's email, though, the right door is
  // "finish setting it up", not a second signup that would only be refused.
  if (signedIn && !store.isLoading && !store.data && !pendingResolving) {
    if (pendingStore) {
      return (
        <SignInFrame title={t("signin.waitingTitle")}>
          <p className="mt-3 text-[var(--brand-muted-2)]">
            <Trans
              t={t}
              i18nKey="signin.waitingBody"
              values={{ store: pendingStore.name }}
              components={{ hl: strongText }}
            />
          </p>
          <Link
            href={finishSetupHref(pendingStore.slug)}
            className="mt-8 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("signin.finishSetup", { store: pendingStore.name })}
          </Link>
        </SignInFrame>
      );
    }
    return (
      <SignInFrame title={t("signin.signedInTitle")}>
        <p className="mt-3 text-[var(--brand-muted-2)]">
          {t("signin.signedInBody")}
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
        >
          {t("signin.createStore")}
        </Link>
      </SignInFrame>
    );
  }

  // Came back from a provider without a session — the handshake failed.
  if (returnedFromOauth && !me.isLoading && !signedIn) {
    return (
      <SignInFrame title={t("signin.failedTitle")}>
        <p className="mt-3 text-[var(--brand-muted-2)]">
          {t("signin.failedBody")}
        </p>
        <SignInOptions className="mt-8" next={SIGNIN_RETURN_PATH} />
        <p className="mt-6 text-sm text-[var(--brand-muted)]">
          {t("signin.noStorePrompt")}{" "}
          <Link href="/signup" className="text-[var(--brand-accent)] underline">
            {t("signin.noStoreLink")}
          </Link>
          .
        </p>
      </SignInFrame>
    );
  }

  // Not signed in yet and not mid-handshake: offer every sign-in method.
  if (!me.isLoading && !signedIn) {
    return (
      <SignInFrame title={t("signin.signInTitle")}>
        <SignInOptions className="mt-8" next={SIGNIN_RETURN_PATH} />
        <p className="mt-6 text-sm text-[var(--brand-muted)]">
          {t("signin.noStorePrompt")}{" "}
          <Link href="/signup" className="text-[var(--brand-accent)] underline">
            {t("signin.noStoreLink")}
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
    <SignInFrame title={t("signin.progressTitle")}>
      <p className="mt-3 text-[var(--brand-muted-2)]">
        {signedIn && store.data
          ? t("signin.takingYouTo", { store: store.data.name })
          : t("signin.oneMoment")}
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
  const { t } = useMarketingT();
  return (
    <Container width="md" className="py-32">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {t("signin.eyebrow")}
      </p>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
        {title}
      </h1>
      {children}
    </Container>
  );
}
