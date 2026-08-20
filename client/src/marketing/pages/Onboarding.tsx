import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { storeAdminUrl } from "@/lib/surface";
import { Container } from "../components/Container";
import { SignInOptions } from "@/components/SignInOptions";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * Post-signup onboarding wizard (docs/ARCHITECTURE.md). The checklist is
 * SERVER-DERIVED (tenant.onboardingStatus): items complete because the real
 * thing exists — a product row, a connected Stripe account — not because a
 * checkbox was clicked. The wizard cursor advances via tenant.setOnboardingCursor
 * once the admin is claimed, so a reload resumes where the merchant left off.
 */

const CLAIM_TOKEN_KEY = "gwinn_claim_token";

/**
 * The "become your store's admin" step. Signup stashes a one-time claim token in
 * sessionStorage; the owner then signs in (Google, Apple, or an emailed magic
 * link — see SignInOptions) and this redeems the token via tenant.claimAdmin,
 * linking their account to the store as admin. The token — not the email —
 * authorizes the claim, so a signup can't attach itself to someone else's login.
 *
 * The token only lives in the signup tab's sessionStorage, though, so a failed
 * sign-in, a closed tab, or a second device loses it while the store already
 * exists — and retrying signup then refuses the email. The recovery path is
 * tenant.pendingClaim/resumeClaim: once the owner signs in with the address
 * they typed at signup (provider-verified), the waiting store is found by
 * email match and one click finishes the claim.
 */
function ClaimStep({
  store,
  urlToken,
}: {
  store: string | null;
  urlToken: string | null;
}) {
  const { t } = useMarketingT();
  // The same-tab signup flow leaves the token in sessionStorage; the emailed
  // claim link carries it in the URL (?claim=…) so it survives any browser
  // state. Either one authorizes the claim.
  const claimToken = useMemo(() => {
    if (urlToken) return urlToken;
    try {
      return sessionStorage.getItem(CLAIM_TOKEN_KEY);
    } catch {
      return null;
    }
  }, [urlToken]);

  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const isAuthed = !!me.data;
  const claim = trpc.tenant.claimAdmin.useMutation();
  const resume = trpc.tenant.resumeClaim.useMutation();
  // `tokenFailed` keeps the email fallback open; `failed` is the true dead end.
  const [state, setState] = useState<
    "idle" | "claiming" | "done" | "tokenFailed" | "failed"
  >("idle");
  const [claimedSlug, setClaimedSlug] = useState<string | null>(null);
  // The server's actual refusal, so a CONFLICT ("this account already manages
  // a store") is never masked by generic invalid-link copy — that masking is
  // what made the parked-on-the-platform-tenant bug undiagnosable from the UI.
  const [claimError, setClaimError] = useState<string | null>(null);

  const finishClaim = (slug: string | null) => {
    try {
      sessionStorage.removeItem(CLAIM_TOKEN_KEY);
    } catch {
      /* storage disabled — token stays, but the claim already succeeded */
    }
    setClaimedSlug(slug ?? store);
    setState("done");
  };

  // Once the owner is signed in and a token is present, redeem it exactly once.
  useEffect(() => {
    if (!claimToken || !isAuthed || state !== "idle") return;
    setState("claiming");
    claim.mutate(
      { token: claimToken },
      {
        onSuccess: (data) => finishClaim(data.slug),
        onError: (err) => {
          setClaimError(err.message || null);
          setState("tokenFailed");
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimToken, isAuthed, state, claim, store]);

  // The email-match fallback lookup — only when the token path can't run
  // (no token in this tab) or was refused (already burned, storage lost).
  const wantResume =
    isAuthed && ((state === "idle" && !claimToken) || state === "tokenFailed");
  const pending = trpc.tenant.pendingClaim.useQuery(undefined, {
    enabled: wantResume,
    retry: false,
  });

  const startResume = () => {
    setState("claiming");
    resume.mutate(undefined, {
      onSuccess: (data) => finishClaim(data.slug),
      onError: (err) => {
        setClaimError(err.message || null);
        setState("failed");
      },
    });
  };

  // Cross-surface: a full-page navigation, not a wouter <Link>, so the app
  // re-resolves onto the storefront surface (see lib/surface.storeAdminUrl).
  const adminHref = (slug: string | null) => (slug ? storeAdminUrl(slug) : "/");

  const finishing = (
    <p className="text-sm text-[var(--brand-muted-2)]">
      {t("onboarding.finishing")}
    </p>
  );

  const resumeCard = (lead: string) =>
    pending.data ? (
      <div>
        <p className="font-medium text-[var(--brand-text)]">{lead}</p>
        <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
          {t("onboarding.resumeBody", {
            store: pending.data.name,
            email: me.data?.email ?? t("onboarding.thisAccountEmail"),
          })}
        </p>
        <button
          type="button"
          onClick={startResume}
          className="mt-3 inline-block rounded-md bg-[var(--brand-ink)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
        >
          {t("onboarding.finishSetup", { store: pending.data.name })}
        </button>
      </div>
    ) : null;

  const signInCard = (
    <div>
      <p className="font-medium text-[var(--brand-text)]">
        {t("onboarding.oneMoreStep")}
      </p>
      <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
        {claimToken
          ? t("onboarding.signInToClaim")
          : t("onboarding.signInWithSignupEmail")}
      </p>
      <SignInOptions
        className="mt-3"
        // Preserve the URL-borne token across the OAuth round-trip; the
        // sessionStorage one survives in the tab on its own.
        next={(() => {
          const qs = new URLSearchParams();
          if (store) qs.set("store", store);
          if (urlToken) qs.set("claim", urlToken);
          const s = qs.toString();
          return `/onboarding${s ? `?${s}` : ""}`;
        })()}
      />
    </div>
  );

  let inner: React.ReactNode = null;
  if (state === "done") {
    inner = (
      <div>
        <p className="font-medium text-[var(--brand-text)]">
          {t("onboarding.doneTitle")}
        </p>
        <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
          {t("onboarding.doneBody")}
        </p>
        <a
          href={adminHref(claimedSlug)}
          className="mt-3 inline-block rounded-md bg-[var(--brand-ink)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
        >
          {t("onboarding.goToDashboard")}
        </a>
      </div>
    );
  } else if (state === "claiming") {
    inner = finishing;
  } else if (state === "tokenFailed" || state === "failed") {
    if (state === "tokenFailed" && pending.isLoading) {
      inner = finishing;
    } else if (state === "tokenFailed" && pending.data) {
      inner = resumeCard(t("onboarding.resumeLeadTokenFailed"));
    } else {
      inner = (
        <div>
          <p className="font-medium text-[var(--brand-text)]">
            {t("onboarding.failedTitle")}
          </p>
          <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
            {claimError ?? t("onboarding.failedBody")}
          </p>
        </div>
      );
    }
  } else if (claimToken) {
    // Fresh from signup in this tab: redeem automatically once signed in.
    inner = isAuthed ? finishing : signInCard;
  } else if (!isAuthed) {
    // No token and not signed in: only prompt when this URL names a store —
    // i.e. someone actually mid-signup — never on a bare /onboarding visit.
    inner = !me.isLoading && store ? signInCard : null;
  } else if (pending.data) {
    // Signed in, no token, and an unclaimed store matches this email.
    inner = resumeCard(t("onboarding.resumeLeadWaiting"));
  }

  if (!inner) return null;
  return (
    <div className="mb-8 rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/8 p-5">
      {inner}
    </div>
  );
}

export default function Onboarding() {
  const { t } = useMarketingT();
  // Checklist copy is server-derived and keyed into the admin namespace
  // (server/onboarding.ts returns keys, not sentences), so it needs its own
  // translator alongside this page's marketing one.
  const { t: tTask } = useTranslation("admin");
  const search = useSearch();
  const { store, urlToken } = useMemo(() => {
    const params = new URLSearchParams(search);
    // `claim` arrives via the emailed claim link (tenant.create step 8).
    return { store: params.get("store"), urlToken: params.get("claim") };
  }, [search]);

  const status = trpc.tenant.onboardingStatus.useQuery(undefined, {
    // Live: async platform steps (e.g. Stripe Connect return) tick off here.
    refetchInterval: 5000,
    retry: false,
  });
  const setCursor = trpc.tenant.setOnboardingCursor.useMutation();
  const [cursorAdvanced, setCursorAdvanced] = useState(false);

  const tasks = status.data?.tasks ?? [];
  const doneCount = status.data?.doneCount ?? 0;
  const totalCount = status.data?.totalCount ?? 1;
  const allDone = status.data?.allDone ?? false;

  // Once the wizard is reachable with a tenant context (post-claim), advance
  // the server cursor to "saw the checklist" — reloads resume from here.
  useEffect(() => {
    if (cursorAdvanced || !status.data || status.data.cursor >= 2) return;
    setCursorAdvanced(true);
    setCursor.mutate({ step: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data, cursorAdvanced]);

  return (
    <Container width="2xl" className="py-20">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {store
          ? t("onboarding.welcomeStore", { store })
          : t("onboarding.welcome")}
      </p>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
        {t("onboarding.heading")}
      </h1>
      <p className="mt-3 text-[var(--brand-muted-2)]">
        {t("onboarding.intro")}
      </p>

      <div className="mt-8">
        <ClaimStep store={store} urlToken={urlToken} />
      </div>

      <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[var(--brand-surface)]">
        <div
          className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
          style={{ width: `${(doneCount / totalCount) * 100}%` }}
        />
      </div>

      <ol className="mt-8 space-y-4">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex gap-4 rounded-xl border border-[var(--brand-border)] bg-white p-5"
          >
            <span
              aria-label={
                task.done
                  ? t("onboarding.taskDone")
                  : t("onboarding.taskNotDone")
              }
              className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border text-xs ${
                task.done
                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-[var(--brand-accent-fg)]"
                  : "border-[var(--brand-border-2)] text-transparent"
              }`}
            >
              ✓
            </span>
            <div className="flex-1">
              <h3
                className={`font-serif text-lg ${task.done ? "text-[var(--brand-muted)] line-through" : "text-[var(--brand-text)]"}`}
              >
                {tTask(task.titleKey, task.params)}
              </h3>
              <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
                {task.blockedReasonKey
                  ? tTask(task.blockedReasonKey, task.params)
                  : tTask(task.bodyKey, task.params)}
              </p>
              {!task.done && task.href && !task.blockedReasonKey && (
                <Link
                  href={task.href}
                  className="mt-2 inline-block text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-accent)] hover:underline"
                >
                  {t("onboarding.goThere")}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>

      <a
        href={store ? storeAdminUrl(store) : "/admin"}
        className={`mt-8 inline-block rounded-md px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] transition-colors ${
          allDone
            ? "bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] hover:bg-[var(--brand-accent-light)]"
            : "border border-[var(--brand-ink)]/25 text-[var(--brand-ink)] hover:bg-[var(--brand-ink)] hover:text-white"
        }`}
      >
        {allDone
          ? t("onboarding.goToDashboard")
          : t("onboarding.continueDashboard")}
      </a>
    </Container>
  );
}
