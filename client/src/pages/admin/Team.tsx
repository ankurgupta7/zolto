/**
 * Team (account plane) — staff seats and invites within the plan's seat limit
 * (PLAN_FEATURES.maxStaff). Seat usage, the invite flow, and revoke/remove all
 * come from the staff.* router, which enforces the cap server-side; this page
 * is the merchant-facing surface for it.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserPlus, Trash2, Mail, Copy, Users } from "lucide-react";
import { Link } from "wouter";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
  AdminOnly,
} from "@/components/admin/ui";

export default function Team() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.staff.list.useQuery(undefined, { retry: false });
  const [email, setEmail] = useState("");

  const invite = trpc.staff.invite.useMutation({
    onSuccess: (data) => {
      utils.staff.list.invalidate();
      setEmail("");
      if (data.emailed) {
        toast.success(t("store.team.inviteSentToast"));
      } else {
        toast.success(t("store.team.inviteCreatedToast"));
        navigator.clipboard?.writeText(data.claimUrl);
      }
    },
    onError: (e) => toast.error(e.message || t("store.team.inviteError")),
  });

  const revoke = trpc.staff.revokeInvite.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      toast.success(t("store.team.revokedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.team.revokeError")),
  });

  const remove = trpc.staff.removeStaff.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      toast.success(t("store.team.removedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.team.removeError")),
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const data = list.data;
  const seatsUsed = data?.seatsUsed ?? 0;
  const seatLimit = data?.seatLimit ?? 1;
  const seatsFull = seatsUsed >= seatLimit;

  const onInvite = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error(t("store.team.invalidEmail"));
      return;
    }
    invite.mutate({ email: email.trim() });
  };

  return (
    <div>
      <PageHeader
        title={t("store.team.title")}
        description={t("store.team.description")}
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {t("store.team.seatsUsed", { used: seatsUsed, limit: seatLimit })}
          </span>
        }
      />

      <SettingsCard title={t("store.team.inviteTitle")}>
        {seatsFull ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {t("store.team.seatsFullNotice", { count: seatLimit })}
            </p>
            <Link
              href="/admin/account/plan"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("store.team.viewPlans")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label={t("store.team.emailLabel")} htmlFor="invite-email">
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onInvite()}
                  placeholder="teammate@example.com"
                  className={inputClass}
                />
              </Field>
            </div>
            <PrimaryButton onClick={onInvite} loading={invite.isPending}>
              <UserPlus className="h-4 w-4" />
              {t("store.team.sendInvite")}
            </PrimaryButton>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title={t("store.team.membersTitle")}>
        <ul className="divide-y">
          {data?.staff.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {m.name || m.email || t("store.team.memberFallback")}
                </p>
                {m.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                  {m.role}
                </span>
                {m.role === "staff" && (
                  <button
                    type="button"
                    aria-label={t("store.team.removeAria", {
                      name: m.email ?? t("store.team.removeFallbackName"),
                    })}
                    onClick={() => remove.mutate({ userId: m.id })}
                    disabled={remove.isPending}
                    className="text-muted-foreground transition-colors hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {(!data || data.staff.length === 0) && (
            <li className="py-3 text-sm text-muted-foreground">
              {t("store.team.noMembers")}
            </li>
          )}
        </ul>
      </SettingsCard>

      {data && data.pendingInvites.length > 0 && (
        <SettingsCard title={t("store.team.pendingTitle")}>
          <ul className="divide-y">
            {data.pendingInvites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-foreground">
                    {inv.email}
                  </span>
                </div>
                <SecondaryButton
                  onClick={() => revoke.mutate({ inviteId: inv.id })}
                  loading={revoke.isPending}
                  className="px-3 py-1.5 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t("store.team.revoke")}
                </SecondaryButton>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}
    </div>
  );
}
