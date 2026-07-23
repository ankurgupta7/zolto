import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";

/**
 * Post-signup onboarding wizard. Currently a client-side guided checklist — the
 * server has an `onboardingStep` column on `tenants` but no mutation to persist it
 * yet, so progress here is not saved across reloads. Wiring it to a
 * tenant.updateOnboardingStep mutation is a tracked follow-up.
 */

const CLAIM_TOKEN_KEY = "zolto_claim_token";

/**
 * The "become your store's admin" step. Signup stashes a one-time claim token in
 * sessionStorage; the owner then signs in (any Google account) and this redeems
 * the token via tenant.claimAdmin, linking their account to the store as admin.
 * The token — not the email — authorizes the claim, so a signup can't attach
 * itself to someone else's login.
 */
function ClaimStep({ store }: { store: string | null }) {
  const claimToken = useMemo(() => {
    try {
      return sessionStorage.getItem(CLAIM_TOKEN_KEY);
    } catch {
      return null;
    }
  }, []);

  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const isAuthed = !!me.data;
  const claim = trpc.tenant.claimAdmin.useMutation();
  const [state, setState] = useState<"idle" | "claiming" | "done" | "error">(
    "idle",
  );
  const [claimedSlug, setClaimedSlug] = useState<string | null>(null);

  // Once the owner is signed in and a token is present, redeem it exactly once.
  useEffect(() => {
    if (!claimToken || !isAuthed || state !== "idle") return;
    setState("claiming");
    claim.mutate(
      { token: claimToken },
      {
        onSuccess: (data) => {
          try {
            sessionStorage.removeItem(CLAIM_TOKEN_KEY);
          } catch {
            /* storage disabled — token stays, but the claim already succeeded */
          }
          setClaimedSlug(data.slug ?? store);
          setState("done");
        },
        onError: () => setState("error"),
      },
    );
  }, [claimToken, isAuthed, state, claim, store]);

  // No pending claim (reached onboarding without a fresh signup) — nothing to do.
  if (!claimToken && state === "idle") return null;

  const adminHref = (slug: string | null) =>
    slug ? `/admin?surface=storefront&tenant=${encodeURIComponent(slug)}` : "/";

  let inner: React.ReactNode;
  if (state === "done") {
    inner = (
      <div>
        <p className="font-medium text-[var(--brand-text)]">
          You're the store admin. 🎉
        </p>
        <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
          Your account now manages this store.
        </p>
        <Link
          href={adminHref(claimedSlug)}
          className="mt-3 inline-block rounded-md bg-[var(--brand-ink)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
        >
          Go to your dashboard →
        </Link>
      </div>
    );
  } else if (state === "error") {
    inner = (
      <div>
        <p className="font-medium text-[var(--brand-text)]">
          We couldn't finish setting you up.
        </p>
        <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
          This claim link is invalid or has already been used. If you already
          signed in on another device, you're all set.
        </p>
      </div>
    );
  } else if (isAuthed || state === "claiming") {
    inner = (
      <p className="text-sm text-[var(--brand-muted-2)]">
        Finishing your setup…
      </p>
    );
  } else {
    inner = (
      <div>
        <p className="font-medium text-[var(--brand-text)]">One more step</p>
        <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
          Sign in to become the admin of your new store.
        </p>
        <a
          href={getLoginUrl(
            `/onboarding${store ? `?store=${encodeURIComponent(store)}` : ""}`,
          )}
          className="mt-3 inline-block rounded-md bg-[var(--brand-ink)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
        >
          Sign in with Google
        </a>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/8 p-5">
      {inner}
    </div>
  );
}

const STEPS = [
  {
    title: "Add your branding",
    body: "Upload your logo and pick your brand color. Your storefront themes itself from these.",
  },
  {
    title: "Add your first product",
    body: "Snap a photo and let the AI draft the description, or import a CSV of your catalog.",
  },
  {
    title: "Connect payments",
    body: "Link Stripe to accept cards online and TWINT/Tap-to-Pay at the market.",
  },
  {
    title: "Make your first sale",
    body: "Share your store link, ring up a sale on POS, and watch inventory sync in real time.",
  },
];

export default function Onboarding() {
  const search = useSearch();
  const store = useMemo(
    () => new URLSearchParams(search).get("store"),
    [search],
  );
  const [done, setDone] = useState<boolean[]>(() => STEPS.map(() => false));

  const completed = done.filter(Boolean).length;
  const allDone = completed === STEPS.length;

  const toggle = (i: number) =>
    setDone((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        welcome{store ? ` — ${store}` : ""}
      </p>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
        Let's get your store live.
      </h1>
      <p className="mt-3 text-[var(--brand-muted-2)]">
        Four steps. You can do them now or come back anytime.
      </p>

      <div className="mt-8">
        <ClaimStep store={store} />
      </div>

      <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[var(--brand-surface)]">
        <div
          className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
          style={{ width: `${(completed / STEPS.length) * 100}%` }}
        />
      </div>

      <ol className="mt-8 space-y-4">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-xl border border-[var(--brand-border)] bg-white p-5"
          >
            <button
              type="button"
              aria-pressed={done[i]}
              aria-label={`Mark "${step.title}" ${done[i] ? "incomplete" : "complete"}`}
              onClick={() => toggle(i)}
              className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border text-xs transition-colors ${
                done[i]
                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-[var(--brand-ink)]"
                  : "border-[var(--brand-border-2)] text-transparent hover:border-[var(--brand-accent)]"
              }`}
            >
              ✓
            </button>
            <div>
              <h3
                className={`font-serif text-lg ${done[i] ? "text-[var(--brand-muted)] line-through" : "text-[var(--brand-text)]"}`}
              >
                {step.title}
              </h3>
              <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href={
          store
            ? `/?surface=storefront&tenant=${encodeURIComponent(store)}`
            : "/"
        }
        className={`mt-8 inline-block rounded-md px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] transition-colors ${
          allDone
            ? "bg-[var(--brand-accent)] text-[var(--brand-ink)] hover:bg-[var(--brand-accent-light)]"
            : "border border-[var(--brand-ink)]/25 text-[var(--brand-ink)] hover:bg-[var(--brand-ink)] hover:text-white"
        }`}
      >
        {allDone ? "Go to your store →" : "Skip to your store"}
      </Link>
    </div>
  );
}
