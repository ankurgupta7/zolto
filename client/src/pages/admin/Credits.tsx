/**
 * AI credits (account plane) — the one metered resource, given a first-class
 * surface (docs/ARCHITECTURE-ADMIN.md §7). Balance is a derived sum over the
 * photo-credit ledger; the page shows the current balance, the monthly plan
 * grant, pay-as-you-go top-up packs, and the ledger for transparency. Stripe
 * returns here with ?credits=1 after a successful purchase.
 */
import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  AdminOnly,
} from "@/components/admin/ui";

const CREDIT_PACKS = [10, 25, 50, 100] as const;

const LEDGER_LABELS: Record<string, string> = {
  monthly_grant: "Monthly plan bucket",
  purchase: "Top-up purchase",
  consumption: "AI photo generated",
  refund: "Refund (generation failed)",
};

export default function Credits() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const utils = trpc.useUtils();

  const status = trpc.billing.getStatus.useQuery(undefined, { retry: false });
  const history = trpc.billing.photoCreditHistory.useQuery(undefined, {
    retry: false,
  });

  const purchase = trpc.billing.purchasePhotoCredits.useMutation({
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (e) => toast.error(e.message || "Could not start checkout."),
  });

  // Stripe redirects back with ?credits=1 on a successful top-up.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("credits") === "1") {
      toast.success("Credits added to your balance.");
      utils.billing.getStatus.invalidate();
      utils.billing.photoCreditHistory.invalidate();
      navigate(location.split("?")[0], { replace: true });
    }
  }, [location, navigate, utils]);

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const credits = status.data?.photoCredits;
  const billingConfigured = status.data?.billingConfigured ?? false;

  return (
    <div>
      <PageHeader
        title="AI credits"
        description="Credits power AI product photos. Your plan grants some each month; buy more any time."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Balance
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            {credits?.balance ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Monthly plan grant
          </span>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            {credits?.monthlyBucket ?? 0}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Price per credit
          </span>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            {credits ? `CHF ${credits.priceChf}` : "—"}
          </p>
        </div>
      </div>

      <SettingsCard
        title="Buy more credits"
        description={credits?.unit ? `Charged ${credits.unit}. Purchased credits never expire.` : undefined}
      >
        {billingConfigured ? (
          <div className="flex flex-wrap gap-3">
            {CREDIT_PACKS.map((qty) => (
              <PrimaryButton
                key={qty}
                onClick={() => purchase.mutate({ quantity: qty })}
                loading={purchase.isPending}
              >
                +{qty}
              </PrimaryButton>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Credits aren't purchasable on this deployment yet — billing isn't
            configured.
          </p>
        )}
      </SettingsCard>

      <SettingsCard title="History">
        {history.data && history.data.length > 0 ? (
          <ul className="divide-y">
            {history.data.map((row) => {
              const delta = (row as { delta: number }).delta;
              const kind = (row as { kind: string }).kind;
              const createdAt = (row as { createdAt: string | Date }).createdAt;
              return (
                <li
                  key={(row as { id: number }).id}
                  className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-foreground">
                      {LEDGER_LABELS[kind] ?? kind}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`tabular-nums font-medium ${delta >= 0 ? "text-emerald-600" : "text-muted-foreground"}`}
                  >
                    {delta >= 0 ? `+${delta}` : delta}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No credit activity yet.</p>
        )}
      </SettingsCard>
    </div>
  );
}
