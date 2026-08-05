/**
 * Reconciliation (store plane) — day-end tidying of sales that arrived without
 * a clean product match. Two scans, both from the reconciliation.* router:
 *   • Stripe payments missing from our records → email a match request.
 *   • Amount-only in-person sales with no piece attached → email a confirm link.
 * Each scan is idempotent; the merchant runs it and confirms guesses by email.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CreditCard, Receipt } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  AdminOnly,
} from "@/components/admin/ui";

export default function Reconciliation() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const [stripeResult, setStripeResult] = useState<string | null>(null);
  const [posResult, setPosResult] = useState<string | null>(null);

  const stripeScan = trpc.reconciliation.run.useMutation({
    onSuccess: (data) => {
      const msg =
        data.newPendingReview > 0
          ? t(
              data.emailSent
                ? "ops.reconciliation.stripeFoundSent"
                : "ops.reconciliation.stripeFoundNotSent",
              { count: data.newPendingReview },
            )
          : data.newNoCandidates > 0
            ? t("ops.reconciliation.stripeNoCandidates", {
                count: data.newNoCandidates,
              })
            : t("ops.reconciliation.stripeClean", {
                count: data.scannedSucceededPayments,
              });
      setStripeResult(msg);
      toast.success(msg);
    },
    onError: (e) =>
      toast.error(e.message || t("ops.reconciliation.stripeFailed")),
  });

  const posScan = trpc.reconciliation.runPos.useMutation({
    onSuccess: (data) => {
      const msg =
        data.newPendingReview > 0
          ? t(
              data.emailSent
                ? "ops.reconciliation.posFoundSent"
                : "ops.reconciliation.posFoundNotSent",
              { count: data.newPendingReview },
            )
          : data.newNoCandidates > 0
            ? t("ops.reconciliation.posNoCandidates", {
                count: data.newNoCandidates,
              })
            : t("ops.reconciliation.posClean", { count: data.scannedLines });
      setPosResult(msg);
      toast.success(msg);
    },
    onError: (e) => toast.error(e.message || t("ops.reconciliation.posFailed")),
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title={t("ops.reconciliation.title")}
        description={t("ops.reconciliation.description")}
      />

      <SettingsCard
        title={t("ops.reconciliation.stripeTitle")}
        description={t("ops.reconciliation.stripeDescription")}
        footer={
          <PrimaryButton
            onClick={() => stripeScan.mutate({})}
            loading={stripeScan.isPending}
          >
            <CreditCard className="h-4 w-4" />
            {t("ops.reconciliation.stripeButton")}
          </PrimaryButton>
        }
      >
        {stripeResult ? (
          <p className="text-sm text-foreground">{stripeResult}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("ops.reconciliation.stripeIdle")}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("ops.reconciliation.posTitle")}
        description={t("ops.reconciliation.posDescription")}
        footer={
          <PrimaryButton
            onClick={() => posScan.mutate({})}
            loading={posScan.isPending}
          >
            <Receipt className="h-4 w-4" />
            {t("ops.reconciliation.posButton")}
          </PrimaryButton>
        }
      >
        {posResult ? (
          <p className="text-sm text-foreground">{posResult}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("ops.reconciliation.posIdle")}
          </p>
        )}
      </SettingsCard>
    </div>
  );
}
