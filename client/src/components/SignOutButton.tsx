/**
 * Sign out — the explicit counterpart to signing in.
 *
 * Zolto had no sign-out control outside a store's admin. Combined with pages
 * that silently reused whatever session already existed, that meant a visitor
 * signed in through Google was stuck as that account: no way to see who they
 * were, and no way to become somebody else. Every surface that can show a
 * signed-in state should therefore also offer this.
 *
 * The redirect after signing out is a *hard* navigation on purpose. The surface
 * (marketing vs storefront) is resolved once at app mount and auth state is
 * cached by react-query across the whole tree, so a client-side route change
 * would leave both stale — the nav would keep claiming you were signed in.
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { hardRedirect } from "@/lib/navigate";

export function SignOutButton({
  /** Where to land afterwards. Defaults to the platform's front door. */
  to = "/",
  className,
  children = "Sign out",
}: {
  to?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // `catch`, not just `finally`: useAuth().logout rethrows anything that
        // isn't an already-expired session, and an async onClick that rejects
        // is an unhandled promise rejection in the browser. Navigate either
        // way — on success the cookie is gone, and on failure a full reload is
        // still the honest way to re-read whatever session actually remains,
        // rather than leaving the user on a page that insists they are out.
        try {
          await logout();
        } catch {
          /* fall through to the reload */
        }
        hardRedirect(to);
      }}
      className={className}
    >
      {busy ? "Signing out…" : children}
    </button>
  );
}

export default SignOutButton;
