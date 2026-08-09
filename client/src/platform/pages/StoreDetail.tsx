/**
 * One store, as the operator sees it when a merchant is stuck.
 *
 * The repairs here are the ones that otherwise need SSH and a MySQL prompt
 * (deploy/tenant-admin.sh): promote a user to the store's admin, and move the
 * store between plans. Plus the one deliberate favour — putting a store on the
 * house. All of them are superadmin-only server-side; the role checks on this
 * page only decide what is drawn.
 *
 * "Plan" and "On the house" are different cards on purpose. Plan edits
 * `tenants.plan`, the column Stripe's webhooks write, and is for when billing
 * and access have diverged. A comp is a separate grant that survives those
 * webhooks and says so on the merchant's own billing page — see
 * shared/entitlements.ts.
 */

import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  SecondaryButton,
  LoadingState,
  inputClass,
} from "@/components/admin/ui";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default function StoreDetail({ tenantId }: { tenantId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.platform.tenantDetail.useQuery(
    { tenantId },
    { retry: false, enabled: Number.isFinite(tenantId) },
  );

  const invalidate = () => {
    utils.platform.tenantDetail.invalidate({ tenantId });
    utils.platform.tenants.invalidate();
  };

  const setRole = trpc.platform.setTenantUserRole.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Role updated. They need to sign out and back in.");
    },
    onError: (e) => toast.error(e.message || "Could not change the role."),
  });

  const setPlan = trpc.platform.setTenantPlan.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(
        "Plan changed. Stripe is untouched — reconcile separately.",
      );
    },
    onError: (e) => toast.error(e.message || "Could not change the plan."),
  });

  const [note, setNote] = useState("");
  const setComp = trpc.platform.setTenantComp.useMutation({
    onSuccess: () => {
      invalidate();
      setNote("");
      toast.success("Comp updated. The store's own billing is untouched.");
    },
    onError: (e) => toast.error(e.message || "Could not update the comp."),
  });

  if (!Number.isFinite(tenantId)) {
    return <p className="text-sm text-muted-foreground">Invalid store id.</p>;
  }
  if (query.isLoading) return <LoadingState label="Loading the store…" />;
  if (query.error) {
    return (
      <div>
        <Link
          href="/platform/stores"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All stores
        </Link>
        <p className="text-sm text-muted-foreground">{query.error.message}</p>
      </div>
    );
  }

  const detail = query.data;
  if (!detail) return null;
  const { tenant, users } = detail;
  const host = tenant.domain ?? `${tenant.slug}.zolto.ch`;
  const comp = tenant.comp;
  const noAdmin = tenant.adminCount === 0;

  return (
    <div>
      <Link
        href="/platform/stores"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All stores
      </Link>

      <PageHeader
        title={tenant.name}
        description={`Store #${tenant.id} · joined ${new Date(tenant.createdAt).toLocaleDateString("en-CH")}`}
      />

      {noAdmin && users.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            This store has no admin
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Every admin action fails for these users, usually surfacing as a
            "Connect Stripe" permissions error. Promote the owner below.
          </p>
        </div>
      )}

      <SettingsCard title="Identity">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Row label="Address">
            <a
              href={`https://${host}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {host} <ExternalLink className="h-3 w-3" />
            </a>
          </Row>
          <Row label="Subscription">{tenant.subscriptionStatus ?? "—"}</Row>
          <Row label="Stripe Connect">
            {tenant.stripeConnected ? "linked" : "not linked"}
          </Row>
          <Row label="Onboarding step">
            {tenant.onboardingStep === -1
              ? "dismissed"
              : (tenant.onboardingStep ?? 0)}
          </Row>
          <Row label="Referral code">{tenant.referralCode ?? "—"}</Row>
          <Row label="Trial ends">
            {tenant.trialEndsAt
              ? new Date(tenant.trialEndsAt).toLocaleDateString("en-CH")
              : "—"}
          </Row>
        </dl>
      </SettingsCard>

      <SettingsCard
        title="Paid plan"
        description="The plan this store pays for. Changes entitlement only — Stripe is not touched — so use this when billing and access have diverged. To give a store something for nothing, use “On the house” below instead: it survives Stripe's webhooks and tells the merchant it's a gift."
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground">
            Currently <strong className="capitalize">{tenant.plan}</strong>
          </span>
          <div className="flex gap-2">
            {(["free", "pro"] as const).map((plan) => (
              <SecondaryButton
                key={plan}
                disabled={setPlan.isPending || tenant.plan === plan}
                onClick={() => setPlan.mutate({ tenantId, plan })}
              >
                Move to {plan}
              </SecondaryButton>
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="On the house"
        description="Give this store a plan it doesn't pay for, take no cut of its online and agent orders, or both. Stripe is never touched — the store's own plan and subscription stay exactly as they are, so a cancellation arriving later can't revoke what you grant here."
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            {comp ? (
              <>
                {comp.plan ? (
                  <>
                    Comped to{" "}
                    <strong className="capitalize">{comp.plan}</strong>
                  </>
                ) : (
                  <>Paying for its own plan</>
                )}
                {comp.feeWaived
                  ? ", and pays Zolto 0% on online & agent orders."
                  : "."}
                {comp.grantedAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    Granted{" "}
                    {new Date(comp.grantedAt).toLocaleDateString("en-CH")}.
                  </span>
                )}
                {comp.note && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    “{comp.note}”
                  </span>
                )}
              </>
            ) : (
              <>
                Nothing is comped — this store pays for its plan and Zolto's
                usual online fee.
              </>
            )}
          </p>

          <div>
            <label
              htmlFor="comp-note"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Why (optional)
            </label>
            <input
              id="comp-note"
              type="text"
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Design partner, launch apology, friend of the house…"
              className={`${inputClass} mt-1`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              loading={setComp.isPending}
              onClick={() =>
                setComp.mutate({
                  tenantId,
                  plan: "pro",
                  waiveOnlineFee: true,
                  note: note.trim() || undefined,
                })
              }
            >
              Pro, free, 0% fee
            </PrimaryButton>
            <SecondaryButton
              disabled={setComp.isPending}
              onClick={() =>
                setComp.mutate({
                  tenantId,
                  plan: "pro",
                  waiveOnlineFee: false,
                  note: note.trim() || undefined,
                })
              }
            >
              Free upgrade to Pro only
            </SecondaryButton>
            <SecondaryButton
              disabled={setComp.isPending}
              onClick={() =>
                setComp.mutate({
                  tenantId,
                  plan: null,
                  waiveOnlineFee: true,
                  note: note.trim() || undefined,
                })
              }
            >
              Waive the online fee only
            </SecondaryButton>
            <SecondaryButton
              disabled={setComp.isPending || !comp}
              onClick={() =>
                setComp.mutate({
                  tenantId,
                  plan: null,
                  waiveOnlineFee: false,
                })
              }
            >
              Revoke
            </SecondaryButton>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="People"
        description="Everyone who can sign in to this store. Promoting to admin is the fix for a locked-out owner."
      >
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has ever signed in to this store.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-foreground">
                      {u.email ?? "—"}
                      {u.name && (
                        <span className="block text-xs text-muted-foreground">
                          {u.name}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 capitalize text-muted-foreground">
                      {u.role}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {u.pendingClaim
                        ? "pending claim"
                        : (u.loginMethod ?? "signed in")}
                    </td>
                    <td className="py-2">
                      {u.role === "superadmin" ? (
                        <span className="text-xs text-muted-foreground">
                          platform owner
                        </span>
                      ) : u.pendingClaim ? (
                        <span className="text-xs text-muted-foreground">
                          must sign in first
                        </span>
                      ) : u.role === "admin" ? (
                        <SecondaryButton
                          disabled={setRole.isPending}
                          onClick={() =>
                            setRole.mutate({
                              tenantId,
                              userId: u.id,
                              role: "staff",
                            })
                          }
                        >
                          Demote to staff
                        </SecondaryButton>
                      ) : (
                        <PrimaryButton
                          loading={setRole.isPending}
                          onClick={() =>
                            setRole.mutate({
                              tenantId,
                              userId: u.id,
                              role: "admin",
                            })
                          }
                        >
                          Make admin
                        </PrimaryButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
