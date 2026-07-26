/**
 * Admin Billing — the merchant's own plan + AI photo credits page.
 *
 * Shows the current plan and billing status, lets the owner upgrade to a paid
 * plan via Stripe Checkout, buy pay-as-you-go AI photo credit packs, and audit
 * their credit ledger (grants, purchases, consumption). Stripe redirects back
 * here with ?upgraded=1 / ?credits=1 / ?cancelled=1 (see server/billing.ts).
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Globe,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

const PLAN_ORDER = ["free", "maker", "studio", "atelier"] as const;

const CREDIT_PACKS = [10, 25, 50, 100] as const;

const CURRENCIES = ["chf", "eur", "usd", "gbp"] as const;

/** Plans that include a custom domain / multi-currency (mirrors PLAN_FEATURES). */
const CUSTOM_DOMAIN_PLANS = new Set(["maker", "studio", "atelier"]);
const MULTI_CURRENCY_PLANS = new Set(["studio", "atelier"]);

function planLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export default function Billing() {
  const { user, isAuthenticated, loading } = useAuth();
  const [location] = useLocation();
  const utils = trpc.useUtils();

  const status = trpc.billing.getStatus.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const history = trpc.billing.photoCreditHistory.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const planCheckout = trpc.billing.createPlanCheckout.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message),
  });

  const creditCheckout = trpc.billing.purchasePhotoCredits.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Team seats ────────────────────────────────────────────────────────────
  const staffQuery = trpc.staff.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const inviteMutation = trpc.staff.invite.useMutation({
    onSuccess: ({ emailed, claimUrl }) => {
      setInviteEmail("");
      utils.staff.list.invalidate();
      if (emailed) toast.success("Invite sent");
      else {
        toast.info("Email isn't configured — copy the invite link instead.");
        navigator.clipboard?.writeText(claimUrl).catch(() => {});
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const revokeMutation = trpc.staff.revokeInvite.useMutation({
    onSuccess: () => utils.staff.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.staff.removeStaff.useMutation({
    onSuccess: () => utils.staff.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  // ── Custom domain + currency (plan-gated store settings) ─────────────────
  const domainStatus = trpc.tenant.domainStatus.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const [domainInput, setDomainInput] = useState<string | null>(null);
  const [currencyInput, setCurrencyInput] = useState<string | null>(null);
  const settingsMutation = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.tenant.domainStatus.invalidate();
      utils.tenant.getSettings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Stripe redirects back here after checkout — confirm + refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded")) {
      toast.success("Plan updated — welcome aboard!");
      utils.billing.getStatus.invalidate();
      utils.billing.photoCreditHistory.invalidate();
    } else if (params.get("credits")) {
      toast.success("Credits added to your balance");
      utils.billing.getStatus.invalidate();
      utils.billing.photoCreditHistory.invalidate();
    } else if (params.get("cancelled")) {
      toast.info("Checkout cancelled — nothing was charged");
    }
  }, [location, utils]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (user?.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  const data = status.data;
  const currentPlan = data?.plan ?? "free";

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <h1 className="text-3xl font-semibold mt-2">Plan &amp; Billing</h1>
        <p className="text-muted-foreground mt-1">
          Your subscription and AI photo credits. Month-to-month, cancel
          anytime.
        </p>
      </div>

      {status.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && !data.billingConfigured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Paid plans aren't purchasable on this deployment yet (Stripe prices
          not configured). Everything on your current plan keeps working.
        </div>
      )}

      {/* Plans */}
      {data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Plans
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((planId) => {
              const plan = data.plans.find((p) => p.id === planId);
              if (!plan) return null;
              const isCurrent = planId === currentPlan;
              const isPaid = plan.priceChf > 0;
              const canUpgrade =
                isPaid &&
                !isCurrent &&
                data.billingConfigured &&
                PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(currentPlan);
              return (
                <div
                  key={planId}
                  className={`rounded-lg border p-4 flex flex-col ${
                    isCurrent ? "border-primary ring-1 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{planLabel(planId)}</span>
                    {isCurrent && (
                      <span className="text-xs bg-primary text-primary-foreground rounded px-2 py-0.5">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {plan.priceChf === 0 ? "Free" : `CHF ${plan.priceChf}`}
                    {plan.priceChf > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">
                        /mo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {plan.includedPhotoCredits > 0
                      ? `${plan.includedPhotoCredits} AI photo credits / month`
                      : "Pay-as-you-go photo credits"}
                  </div>
                  <div className="mt-auto pt-4">
                    {canUpgrade ? (
                      <button
                        type="button"
                        className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        disabled={planCheckout.isPending}
                        onClick={() =>
                          planCheckout.mutate({
                            plan: planId as "maker" | "studio" | "atelier",
                          })
                        }
                      >
                        {planCheckout.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        ) : (
                          "Upgrade"
                        )}
                      </button>
                    ) : (
                      isCurrent && (
                        <div className="text-center text-sm text-muted-foreground py-2">
                          {data.subscriptionStatus === "trialing"
                            ? `Trial until ${
                                data.trialEndsAt
                                  ? new Date(
                                      data.trialEndsAt,
                                    ).toLocaleDateString()
                                  : "—"
                              }`
                            : "Active"}
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Photo credits */}
      {data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> AI Photo Credits
          </h2>
          <div className="rounded-lg border p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-semibold">
                  {data.photoCredits.balance}
                  <span className="text-base font-normal text-muted-foreground">
                    {" "}
                    credits
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {data.photoCredits.monthlyBucket > 0
                    ? `Your plan adds ${data.photoCredits.monthlyBucket}/month. `
                    : "Your plan has no monthly bucket. "}
                  Top up pay-as-you-go — CHF {data.photoCredits.priceChf}{" "}
                  {data.photoCredits.unit}, credits never expire.
                </p>
              </div>
              {data.billingConfigured && (
                <div className="flex gap-2">
                  {CREDIT_PACKS.map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                      disabled={creditCheckout.isPending}
                      onClick={() => creditCheckout.mutate({ quantity: qty })}
                    >
                      +{qty}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Ledger */}
      {history.data && history.data.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> Credit history
          </h2>
          <div className="rounded-lg border divide-y">
            {history.data.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono font-medium ${
                      entry.delta > 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.kind === "monthly_grant" && "Monthly plan bucket"}
                    {entry.kind === "purchase" && "Credit pack purchase"}
                    {entry.kind === "consumption" && "AI photo generated"}
                    {entry.kind === "manual_adjustment" &&
                      (entry.note ?? "Adjustment")}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team seats */}
      {staffQuery.data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5" /> Team seats
            <span className="text-sm font-normal text-muted-foreground">
              {staffQuery.data.seatsUsed} of {staffQuery.data.seatLimit} used
            </span>
          </h2>
          <div className="rounded-lg border divide-y">
            {staffQuery.data.staff.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span>
                  {member.name || member.email}
                  <span className="text-muted-foreground">
                    {" "}
                    · {member.role}
                  </span>
                </span>
                {member.role === "staff" && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-red-600"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate({ userId: member.id })}
                    aria-label={`Remove ${member.email}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {staffQuery.data.pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="text-muted-foreground">
                  {invite.email} · invited
                </span>
                <button
                  type="button"
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate({ inviteId: invite.id })}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail.trim())
                inviteMutation.mutate({ email: inviteEmail.trim() });
            }}
          >
            <input
              type="email"
              required
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={
                inviteMutation.isPending ||
                staffQuery.data.seatsUsed >= staffQuery.data.seatLimit
              }
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" /> Invite
            </button>
          </form>
          {staffQuery.data.seatsUsed >= staffQuery.data.seatLimit && (
            <p className="text-xs text-muted-foreground mt-1.5">
              All seats are in use — upgrade for more.
            </p>
          )}
        </section>
      )}

      {/* Custom domain + currency (plan-gated store settings) */}
      {data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5" /> Store settings
          </h2>
          <div className="rounded-lg border p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Custom domain</span>
                {!CUSTOM_DOMAIN_PLANS.has(currentPlan) && (
                  <span className="text-xs text-muted-foreground">
                    Maker plan and above
                  </span>
                )}
              </div>
              {CUSTOM_DOMAIN_PLANS.has(currentPlan) ? (
                <>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = (domainInput ?? "").trim().toLowerCase();
                      if (v) settingsMutation.mutate({ publicDomain: v });
                    }}
                  >
                    <input
                      type="text"
                      placeholder="shop.example.com"
                      value={domainInput ?? domainStatus.data?.domain ?? ""}
                      onChange={(e) => setDomainInput(e.target.value)}
                      className="flex-1 rounded-md border px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={settingsMutation.isPending}
                      className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </form>
                  {domainStatus.data?.domain && domainStatus.data.expected && (
                    <p className="text-xs mt-1.5">
                      {domainStatus.data.pointsToUs ? (
                        <span className="text-green-700">
                          ✓ {domainStatus.data.domain} points to us — HTTPS is
                          issued automatically on first visit.
                        </span>
                      ) : (
                        <span className="text-amber-700">
                          Create a CNAME record: {domainStatus.data.domain} →{" "}
                          {domainStatus.data.expected}, then wait a few minutes.
                        </span>
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Serve your store on your own domain with managed HTTPS.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Store currency</span>
                {!MULTI_CURRENCY_PLANS.has(currentPlan) && (
                  <span className="text-xs text-muted-foreground">
                    Studio plan and above
                  </span>
                )}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (currencyInput)
                    settingsMutation.mutate({ currency: currencyInput });
                }}
              >
                <select
                  value={currencyInput ?? "chf"}
                  onChange={(e) => setCurrencyInput(e.target.value)}
                  className="rounded-md border px-3 py-2 text-sm bg-white"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={
                    settingsMutation.isPending ||
                    (!MULTI_CURRENCY_PLANS.has(currentPlan) &&
                      (currencyInput ?? "chf") !== "chf")
                  }
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Save
                </button>
              </form>
              <p className="text-xs text-muted-foreground mt-1.5">
                Prices across your storefront and Stripe checkout are shown and
                charged in this currency. Amounts stay as entered.
              </p>
            </div>
          </div>
        </section>
      )}

      {data && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Check className="h-3 w-3" /> Payments are handled by Stripe. Cancel
          anytime — your store and data stay on the free plan.
        </p>
      )}
    </div>
  );
}
