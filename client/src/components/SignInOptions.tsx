import { useState } from "react";
import { getAppleLoginUrl, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

/**
 * Every way to sign in to Zolto: Google, Apple, or a passwordless email link
 * for anyone whose address isn't on either of those — see server/_core's
 * oauth.ts, appleAuth.ts and magicLink.ts.
 *
 * Lives outside `marketing/` because it is used on BOTH surfaces: the signup
 * claim step and /signin on marketing, and every admin page's signed-out
 * state on the storefront. Anywhere the app says "you need to sign in" should
 * render this rather than linking one provider, so no route into the app is a
 * dead end for a merchant without that provider's account.
 *
 * `next` should be an ABSOLUTE url when the caller is on a tenant subdomain:
 * the OAuth round-trip always returns through the platform's canonical host,
 * so a bare path would land the merchant on that host instead of their own
 * store (see server/_core/oauth.ts getCanonicalOrigin).
 */
export function SignInOptions({
  next,
  className,
}: {
  /** Same-origin path or platform-domain absolute URL to return to after sign-in. */
  next?: string;
  className?: string;
}) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ previewUrl?: string } | null>(null);
  const requestMagicLink = trpc.auth.requestMagicLink.useMutation({
    onSuccess: (data) => setSent({ previewUrl: data.previewUrl }),
  });

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validEmail || requestMagicLink.isPending) return;
    requestMagicLink.mutate({ email: email.trim(), next });
  };

  if (sent) {
    return (
      <div className={className}>
        <p className="text-sm text-[var(--brand-text)]">
          Check <span className="font-medium">{email.trim()}</span> for a
          sign-in link. It works once and expires in 15 minutes.
        </p>
        {sent.previewUrl && (
          <p className="mt-2 text-xs text-[var(--brand-muted)]">
            Email isn&rsquo;t configured on this deployment — use the link
            directly:{" "}
            <a
              href={sent.previewUrl}
              className="break-all text-[var(--brand-accent)] underline"
            >
              {sent.previewUrl}
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={getLoginUrl(next)}
          className="flex-1 rounded-md bg-[var(--brand-ink)] px-5 py-2.5 text-center text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
        >
          Continue with Google
        </a>
        <a
          href={getAppleLoginUrl(next)}
          className="flex-1 rounded-md border border-[var(--brand-ink)] px-5 py-2.5 text-center text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
        >
          Continue with Apple
        </a>
      </div>

      {showEmailForm ? (
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded-md border border-[var(--brand-border-2)] bg-white px-3 py-2 text-sm text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
          />
          <button
            type="submit"
            disabled={!validEmail || requestMagicLink.isPending}
            className="rounded-md border border-[var(--brand-ink)]/25 px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requestMagicLink.isPending ? "Sending…" : "Send link"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowEmailForm(true)}
          className="mt-3 text-xs font-medium uppercase tracking-[0.1em] text-[var(--brand-muted-2)] underline underline-offset-2 hover:text-[var(--brand-text)]"
        >
          Or continue with email
        </button>
      )}

      {requestMagicLink.isError && (
        <p className="mt-2 text-xs text-rose-600">
          {requestMagicLink.error.message ||
            "Couldn't send the link. Please try again."}
        </p>
      )}
    </div>
  );
}
