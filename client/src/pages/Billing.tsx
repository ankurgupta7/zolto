/**
 * Admin Billing — the merchant's plan, online-fee, and AI-usage page.
 *
 * Two-tier model (docs/planning/pricing-pivot-agent-commerce.md): Free pays a
 * 1% platform fee on online/agent orders; Pro (flat monthly) removes it and
 * unmeters AI. Shows this month's online sales + fee, the skim-vs-Pro
 * break-even upsell ("you'd save CHF X on Pro"), AI allowance usage, and the
 * generation log. Stripe redirects back here with ?upgraded=1 / ?cancelled=1
 * (see server/billing.ts).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { isStoreAdminRole } from "@/admin/nav";
import { trpc } from "@/lib/trpc";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { SignInOptions } from "@/components/SignInOptions";
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

const PLAN_ORDER = ["free", "pro"] as const;

const CURRENCIES = ["chf", "eur", "usd", "gbp"] as const;

/** Plans that include a custom domain / multi-currency (mirrors PLAN_FEATURES). */
const CUSTOM_DOMAIN_PLANS = new Set(["pro"]);
const MULTI_CURRENCY_PLANS = new Set(["pro"]);

function planLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Swiss regional locale for the active UI language ("it" → "it-CH") — money
 * and invoice dates on this page follow the language the merchant chose, not
 * whatever locale their browser happens to be set to.
 */
function swissLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

export default function Billing() {
  const { t, i18n } = useTranslation("admin");
  const { user, isAuthenticated, loading } = useAuth();
  const [location] = useLocation();
  const utils = trpc.useUtils();

  const status = trpc.billing.getStatus.useQuery(undefined, {
    enabled: isAuthenticated && isStoreAdminRole(user?.role),
  });
  const history = trpc.billing.photoCreditHistory.useQuery(undefined, {
    enabled: isAuthenticated && isStoreAdminRole(user?.role),
  });

  const planCheckout = trpc.billing.createPlanCheckout.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Team seats ────────────────────────────────────────────────────────────
  const staffQuery = trpc.staff.list.useQuery(undefined, {
    enabled: isAuthenticated && isStoreAdminRole(user?.role),
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const inviteMutation = trpc.staff.invite.useMutation({
    onSuccess: ({ emailed, claimUrl }) => {
      setInviteEmail("");
      utils.staff.list.invalidate();
      if (emailed) toast.success(t("catalog.account.billing.toastInviteSent"));
      else {
        toast.info(t("catalog.account.billing.toastInviteLink"));
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
    enabled: isAuthenticated && isStoreAdminRole(user?.role),
  });
  const [domainInput, setDomainInput] = useState<string | null>(null);
  const [currencyInput, setCurrencyInput] = useState<string | null>(null);
  const settingsMutation = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t("catalog.account.billing.toastSettingsSaved"));
      utils.tenant.domainStatus.invalidate();
      utils.tenant.getSettings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Stripe redirects back here after checkout — confirm + refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded")) {
      toast.success(t("catalog.account.billing.toastUpgraded"));
      utils.billing.getStatus.invalidate();
      utils.billing.photoCreditHistory.invalidate();
    } else if (params.get("cancelled")) {
      toast.info(t("catalog.account.billing.toastCancelled"));
    }
  }, [location, utils, t]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Rendered rather than redirected: a merchant whose session lapsed on the
  // billing page keeps their place, and gets every sign-in method instead of
  // being thrown at one provider mid-render.
  if (!isAuthenticated) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        <h2 className="font-serif text-2xl mb-3">
          {t("catalog.account.billing.signedOutTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          {t("catalog.account.billing.signedOutDescription")}
        </p>
        <SignInOptions className="text-left" next={window.location.href} />
      </div>
    );
  }

  if (!isStoreAdminRole(user?.role)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">
          {t("catalog.account.billing.adminsOnly")}
        </p>
      </div>
    );
  }

  const data = status.data;
  const currentPlan = data?.plan ?? "free";
  const locale = swissLocale(i18n.language);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />{" "}
          {t("catalog.account.billing.backToAdmin")}
        </Link>
        <h1 className="text-3xl font-semibold mt-2">
          {t("catalog.account.billing.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("catalog.account.billing.description", {
            fee: data?.onlineFees.feePercentLabel ?? "1%",
          })}
        </p>
      </div>

      {status.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && !data.billingConfigured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {t("catalog.account.billing.notConfigured")}
        </div>
      )}

      {/* Plans */}
      {data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />{" "}
            {t("catalog.account.billing.plansTitle")}
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
                        {t("catalog.account.billing.current")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {plan.priceChf === 0
                      ? t("catalog.account.billing.priceFree")
                      : `CHF ${plan.priceChf}`}
                    {plan.priceChf > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {t("catalog.account.billing.perMonth")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {plan.onlineFeeBps > 0
                      ? t("catalog.account.billing.planFee", {
                          percent: plan.onlineFeeBps / 100,
                        })
                      : t("catalog.account.billing.planNoFee")}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {plan.aiPhotoAllowancePerMonth === null
                      ? t("catalog.account.billing.planUnmeteredAi")
                      : t("catalog.account.billing.planAiShots", {
                          count: plan.aiPhotoAllowancePerMonth,
                        })}
                    {` · ${t("catalog.account.billing.planLimits", {
                      products: plan.maxProducts.toLocaleString(locale),
                      storage: plan.storageGb,
                    })}`}
                  </div>
                  <div className="mt-auto pt-4">
                    {canUpgrade ? (
                      <button
                        type="button"
                        className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        disabled={planCheckout.isPending}
                        onClick={() => planCheckout.mutate({ plan: "pro" })}
                      >
                        {planCheckout.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        ) : (
                          t("catalog.account.billing.upgrade")
                        )}
                      </button>
                    ) : (
                      isCurrent && (
                        <div className="text-center text-sm text-muted-foreground py-2">
                          {data.subscriptionStatus === "trialing"
                            ? t("catalog.account.billing.trialUntil", {
                                date: data.trialEndsAt
                                  ? new Date(
                                      data.trialEndsAt,
                                    ).toLocaleDateString(locale)
                                  : "—",
                              })
                            : t("catalog.account.billing.active")}
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

      {/* Online fees + the skim-vs-Pro upsell */}
      {data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />{" "}
            {t("catalog.account.billing.onlineSalesTitle")}
          </h2>
          <div className="rounded-lg border p-5 space-y-3">
            <div className="flex flex-wrap gap-8">
              <div>
                <div className="text-3xl font-semibold">
                  CHF {data.onlineFees.monthGmvChf.toLocaleString(locale)}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("catalog.account.billing.orderCount", {
                    count: data.onlineFees.monthOrderCount,
                  })}
                  {data.onlineFees.monthAgentGmvChf > 0 &&
                    ` — ${t("catalog.account.billing.agentSplit", {
                      amount:
                        data.onlineFees.monthAgentGmvChf.toLocaleString(locale),
                    })}`}
                </p>
              </div>
              <div>
                <div className="text-3xl font-semibold">
                  CHF {data.onlineFees.monthFeeChf.toLocaleString(locale)}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {data.plan === "pro"
                    ? t("catalog.account.billing.feesOnPro")
                    : t("catalog.account.billing.feesOnFree", {
                        percent: data.onlineFees.feePercentLabel,
                        appliesTo: data.onlineFees.appliesTo,
                      })}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("catalog.account.billing.posNeverFee")}
            </p>
            {data.upsell && data.upsell.savingsChf > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {t("catalog.account.billing.upsell", {
                  savings: data.upsell.savingsChf.toLocaleString(locale),
                  breakEven:
                    data.upsell.breakEvenOnlineChf.toLocaleString(locale),
                  proPrice: data.upsell.proPriceChf,
                  percent: data.onlineFees.feePercentLabel,
                })}
                {data.billingConfigured && (
                  <button
                    type="button"
                    className="ml-2 underline font-medium"
                    disabled={planCheckout.isPending}
                    onClick={() => planCheckout.mutate({ plan: "pro" })}
                  >
                    {t("catalog.account.billing.upgradeNow")}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* AI usage */}
      {data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />{" "}
            {t("catalog.account.billing.aiTitle")}
          </h2>
          <div className="rounded-lg border p-5">
            {data.ai.allowancePerMonth === null ? (
              <p className="text-sm">
                <span className="text-2xl font-semibold">
                  {t("catalog.account.billing.unmetered")}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  {t("catalog.account.billing.unmeteredNote")}
                </span>
              </p>
            ) : (
              <div>
                <div className="text-3xl font-semibold">
                  {data.ai.usedThisMonth}
                  <span className="text-base font-normal text-muted-foreground">
                    {" "}
                    {t("catalog.account.billing.aiUsed", {
                      allowance: data.ai.allowancePerMonth,
                    })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("catalog.account.billing.aiNote")}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ledger */}
      {history.data && history.data.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />{" "}
            {t("catalog.account.billing.logTitle")}
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
                    {entry.kind === "monthly_grant" &&
                      t("catalog.account.billing.ledgerMonthlyGrant")}
                    {entry.kind === "purchase" &&
                      t("catalog.account.billing.ledgerPurchase")}
                    {entry.kind === "consumption" &&
                      t("catalog.account.billing.ledgerConsumption")}
                    {entry.kind === "manual_adjustment" &&
                      (entry.note ??
                        t("catalog.account.billing.ledgerAdjustment"))}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleDateString(locale)}
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
            <Users className="h-5 w-5" />{" "}
            {t("catalog.account.billing.teamTitle")}
            <span className="text-sm font-normal text-muted-foreground">
              {t("catalog.account.billing.seatsUsed", {
                used: staffQuery.data.seatsUsed,
                limit: staffQuery.data.seatLimit,
              })}
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
                    aria-label={t("catalog.account.billing.removeAria", {
                      email: member.email,
                    })}
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
                  {invite.email} · {t("catalog.account.billing.invited")}
                </span>
                <button
                  type="button"
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate({ inviteId: invite.id })}
                >
                  {t("catalog.account.billing.revoke")}
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
              placeholder={t("catalog.account.billing.invitePlaceholder")}
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
              <UserPlus className="h-4 w-4" />{" "}
              {t("catalog.account.billing.invite")}
            </button>
          </form>
          {staffQuery.data.seatsUsed >= staffQuery.data.seatLimit && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {t("catalog.account.billing.seatsFull")}
            </p>
          )}
        </section>
      )}

      {/* Custom domain + currency (plan-gated store settings) */}
      {data && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5" />{" "}
            {t("catalog.account.billing.storeSettingsTitle")}
          </h2>
          <div className="rounded-lg border p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {t("catalog.account.billing.customDomain")}
                </span>
                {!CUSTOM_DOMAIN_PLANS.has(currentPlan) && (
                  <span className="text-xs text-muted-foreground">
                    {t("catalog.account.billing.proPlanBadge")}
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
                      placeholder={t(
                        "catalog.account.billing.domainPlaceholder",
                      )}
                      value={domainInput ?? domainStatus.data?.domain ?? ""}
                      onChange={(e) => setDomainInput(e.target.value)}
                      className="flex-1 rounded-md border px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={settingsMutation.isPending}
                      className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {t("catalog.account.billing.save")}
                    </button>
                  </form>
                  {domainStatus.data?.domain && domainStatus.data.expected && (
                    <p className="text-xs mt-1.5">
                      {domainStatus.data.pointsToUs ? (
                        <span className="text-green-700">
                          {t("catalog.account.billing.domainOk", {
                            domain: domainStatus.data.domain,
                          })}
                        </span>
                      ) : (
                        <span className="text-amber-700">
                          {t("catalog.account.billing.domainPending", {
                            domain: domainStatus.data.domain,
                            expected: domainStatus.data.expected,
                          })}
                        </span>
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("catalog.account.billing.domainLocked")}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {t("catalog.account.billing.storeCurrency")}
                </span>
                {!MULTI_CURRENCY_PLANS.has(currentPlan) && (
                  <span className="text-xs text-muted-foreground">
                    {t("catalog.account.billing.proPlanBadge")}
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
                  {t("catalog.account.billing.save")}
                </button>
              </form>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t("catalog.account.billing.currencyNote")}
              </p>
            </div>
          </div>
        </section>
      )}

      {data && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Check className="h-3 w-3" />{" "}
          {t("catalog.account.billing.stripeFooter")}
        </p>
      )}
    </div>
  );
}
