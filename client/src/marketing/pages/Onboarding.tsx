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
  const [state, setState] = useState<
    "idle" | "claiming" | "done" | "error"
  >("idle");
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
        <p className="font-medium text-white">You're the store admin. 🎉</p>
        <p className="mt-1 text-sm text-slate-300">
          Your account now manages this store.
        </p>
        <Link
          href={adminHref(claimedSlug)}
          className="mt-3 inline-block rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-400"
        >
          Go to your dashboard →
        </Link>
      </div>
    );
  } else if (state === "error") {
    inner = (
      <div>
        <p className="font-medium text-white">
          We couldn't finish setting you up.
        </p>
        <p className="mt-1 text-sm text-slate-300">
          This claim link is invalid or has already been used. If you already
          signed in on another device, you're all set.
        </p>
      </div>
    );
  } else if (isAuthed || state === "claiming") {
    inner = (
      <p className="text-sm text-slate-300">Finishing your setup…</p>
    );
  } else {
    inner = (
      <div>
        <p className="font-medium text-white">One more step</p>
        <p className="mt-1 text-sm text-slate-300">
          Sign in to become the admin of your new store.
        </p>
        <a
          href={getLoginUrl(
            `/onboarding${store ? `?store=${encodeURIComponent(store)}` : ""}`,
          )}
          className="mt-3 inline-block rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-400"
        >
          Sign in with Google
        </a>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-2xl border border-violet-500/40 bg-violet-500/5 p-5">
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
      <p className="text-sm font-medium uppercase tracking-widest text-violet-300">
        Welcome{store ? ` — ${store}` : ""}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Let's get your store live.
      </h1>
      <p className="mt-3 text-slate-300">
        Four steps. You can do them now or come back anytime.
      </p>

      <div className="mt-8">
        <ClaimStep store={store} />
      </div>

      <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${(completed / STEPS.length) * 100}%` }}
        />
      </div>

      <ol className="mt-8 space-y-4">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5"
          >
            <button
              type="button"
              aria-pressed={done[i]}
              aria-label={`Mark "${step.title}" ${done[i] ? "incomplete" : "complete"}`}
              onClick={() => toggle(i)}
              className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border text-xs transition-colors ${
                done[i]
                  ? "border-violet-500 bg-violet-500 text-white"
                  : "border-slate-600 text-transparent hover:border-violet-400"
              }`}
            >
              ✓
            </button>
            <div>
              <h3
                className={`font-medium ${done[i] ? "text-slate-400 line-through" : "text-white"}`}
              >
                {step.title}
              </h3>
              <p className="mt-1 text-sm text-slate-400">{step.body}</p>
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
        className={`mt-8 inline-block rounded-lg px-6 py-3 text-sm font-medium transition-colors ${
          allDone
            ? "bg-violet-500 text-white hover:bg-violet-400"
            : "border border-slate-700 text-slate-200 hover:border-slate-500 hover:text-white"
        }`}
      >
        {allDone ? "Go to your store →" : "Skip to your store"}
      </Link>
    </div>
  );
}
