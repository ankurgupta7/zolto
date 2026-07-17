import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { slugify, isValidSlug } from "../slug";

export default function Signup() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");

  // Auto-derive slug from the store name until the user edits the slug directly.
  const effectiveSlug = slugTouched ? slug : slugify(name);

  const createTenant = trpc.tenant.create.useMutation({
    onSuccess: (data) => {
      // Auth is via the identity provider: stash the one-time claim token so the
      // owner can take ownership (tenant.claimAdmin) once they've signed in.
      try {
        sessionStorage.setItem("zolto_claim_token", data.claimToken);
      } catch {
        /* private-mode / storage disabled — claim can still be re-issued */
      }
      toast.success("Store created — let's set it up.");
      navigate(`/onboarding?store=${encodeURIComponent(data.slug)}`);
    },
    onError: (err) => {
      toast.error(err.message || "Something went wrong. Please try again.");
    },
  });

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 1) e.name = "Store name is required.";
    if (!isValidSlug(effectiveSlug))
      e.slug = "Use 3–64 lowercase letters, numbers, or hyphens.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      e.email = "Enter a valid email.";
    return e;
  }, [name, effectiveSlug, email]);

  const canSubmit = Object.keys(errors).length === 0 && !createTenant.isPending;

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canSubmit) return;
    createTenant.mutate({
      name: name.trim(),
      slug: effectiveSlug,
      email: email.trim(),
    });
  };

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-white">
        Create your store
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Free to start. 14-day trial on paid features. No card required.
      </p>

      <form onSubmit={handleSubmit} className="mt-10 space-y-5" noValidate>
        <Field label="Store name" error={name ? errors.name : undefined}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your store name"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-white outline-none focus:border-violet-500"
          />
        </Field>

        <Field
          label="Store URL"
          error={slugTouched && slug ? errors.slug : undefined}
          hint={
            effectiveSlug ? `${effectiveSlug}.zolto.com` : "yourstore.zolto.com"
          }
        >
          <input
            type="text"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="kalakosh"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-white outline-none focus:border-violet-500"
          />
        </Field>

        <Field
          label="Email"
          error={email ? errors.email : undefined}
          hint="You'll finish setup by signing in with this email."
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-white outline-none focus:border-violet-500"
          />
        </Field>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-violet-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createTenant.isPending ? "Creating…" : "Create store →"}
        </button>

        <p className="text-center text-xs text-slate-500">
          By creating a store you agree to our{" "}
          <a href="/legal/terms" className="text-violet-300 hover:underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/legal/privacy" className="text-violet-300 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}
