/**
 * Claim a staff invite — target of the /claim-staff?token=… link in invite
 * emails. Requires signing in first (any method); on success the caller joins
 * the tenant as staff and lands on the admin panel.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getSignInPath } from "@/const";
import { hardRedirect } from "@/lib/navigate";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function ClaimStaff() {
  const { isAuthenticated, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const attempted = useRef(false);

  const claim = trpc.staff.claimInvite.useMutation({
    onSuccess: () => {
      setDone(true);
      setTimeout(() => {
        window.location.href = "/admin";
      }, 1200);
    },
    onError: (err) => setError(err.message),
  });

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    if (loading || attempted.current) return;
    if (!isAuthenticated) {
      // Sign in first, then come back HERE — the invite token only exists in
      // this url, so dropping it would strand the invitee on the admin panel
      // with the invite unclaimed.
      hardRedirect(getSignInPath(window.location.href), { replace: true });
      return;
    }
    attempted.current = true;
    if (token.length !== 48) {
      setError("This invite link is invalid.");
      return;
    }
    claim.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, token]);

  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      {error ? (
        <>
          <XCircle className="h-10 w-10 text-red-600 mx-auto mb-4" />
          <p className="text-lg font-medium mb-1">Invite couldn't be used</p>
          <p className="text-muted-foreground text-sm">{error}</p>
        </>
      ) : done ? (
        <>
          <CheckCircle2 className="h-10 w-10 text-green-700 mx-auto mb-4" />
          <p className="text-lg font-medium">Welcome to the team!</p>
          <p className="text-muted-foreground text-sm">
            Taking you to the admin panel…
          </p>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Accepting invite…</p>
        </>
      )}
    </div>
  );
}
