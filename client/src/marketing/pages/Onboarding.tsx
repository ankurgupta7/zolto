import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { storeAdminUrl } from "@/lib/surface";
import { Container } from "../components/Container";

/**
 * Post-signup onboarding wizard (docs/ARCHITECTURE.md). The checklist is
 * SERVER-DERIVED (tenant.onboardingStatus): items complete because the real
 * thing exists — a product row, a connected Stripe account — not because a
 * checkbox was clicked. The wizard cursor advances via tenant.setOnboardingCursor
 * once the admin is claimed, so a reload resumes where the merchant left off.
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

  // Cross-surface: a full-page navigation, not a wouter <Link>, so the app
  // re-resolves onto the storefront surface (see lib/surface.storeAdminUrl).
  const adminHref = (slug: string | null) =>
    slug ? storeAdminUrl(slug) : "/";

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
        <a
          href={adminHref(claimedSlug)}
          className="mt-3 inline-block rounded-md bg-[var(--brand-ink)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
        >
          Go to your dashboard →
        </a>
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

export default function Onboarding() {
  const search = useSearch();
  const store = useMemo(
    () => new URLSearchParams(search).get("store"),
    [search],
  );

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
        welcome{store ? ` — ${store}` : ""}
      </p>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
        Let's get your store live.
      </h1>
      <p className="mt-3 text-[var(--brand-muted-2)]">
        This list updates itself as you go — finish a step in the admin and it
        ticks off here, on any device.
      </p>

      <div className="mt-8">
        <ClaimStep store={store} />
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
              aria-label={task.done ? "Done" : "Not done"}
              className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border text-xs ${
                task.done
                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-[var(--brand-ink)]"
                  : "border-[var(--brand-border-2)] text-transparent"
              }`}
            >
              ✓
            </span>
            <div className="flex-1">
              <h3
                className={`font-serif text-lg ${task.done ? "text-[var(--brand-muted)] line-through" : "text-[var(--brand-text)]"}`}
              >
                {task.title}
              </h3>
              <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
                {task.blockedReason ?? task.body}
              </p>
              {!task.done && task.href && !task.blockedReason && (
                <Link
                  href={task.href}
                  className="mt-2 inline-block text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-accent)] hover:underline"
                >
                  Go there →
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
            ? "bg-[var(--brand-accent)] text-[var(--brand-ink)] hover:bg-[var(--brand-accent-light)]"
            : "border border-[var(--brand-ink)]/25 text-[var(--brand-ink)] hover:bg-[var(--brand-ink)] hover:text-white"
        }`}
      >
        {allDone ? "Go to your dashboard →" : "Continue in your dashboard"}
      </a>
    </Container>
  );
}
