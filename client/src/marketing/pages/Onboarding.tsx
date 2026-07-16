import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";

/**
 * Post-signup onboarding wizard. Currently a client-side guided checklist — the
 * server has an `onboardingStep` column on `tenants` but no mutation to persist it
 * yet, so progress here is not saved across reloads. Wiring it to a
 * tenant.updateOnboardingStep mutation is a tracked follow-up.
 */

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
