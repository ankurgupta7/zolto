/**
 * Reconciliation (store plane) — day-end tidying of sales that arrived without
 * a clean product match. Two scans, both from the reconciliation.* router:
 *   • Stripe payments missing from our records → email a match request.
 *   • Amount-only in-person sales with no piece attached → email a confirm link.
 * Both scans are re-runnable: each re-surfaces everything still unconfirmed, and
 * if its email cannot be delivered it hands back the review page itself, which
 * is rendered below the card so the merchant can click the same links here
 * instead of waiting for mail that is not coming.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CreditCard, Receipt, X } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  SecondaryButton,
  AdminOnly,
} from "@/components/admin/ui";

/**
 * The undelivered review email, rendered where the merchant is standing.
 *
 * The frame is sandboxed with `allow-forms` and nothing else — the confirm
 * page's button has to submit, but the mail template gets no scripts and no
 * same-origin access to the admin session around it.
 */
function ReviewPanel({
  html,
  title,
  description,
  dismissLabel,
  onDismiss,
}: {
  html: string;
  title: string;
  description: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // On a phone the panel opens below the fold, which is how a working button
  // reads as a dead one. `scroll-mt` clears the fixed storefront navbar and the
  // admin title bar, which would otherwise sit over the panel's own heading.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div ref={ref} className="scroll-mt-32">
      <SettingsCard
        title={title}
        description={description}
        footer={
          <SecondaryButton onClick={onDismiss}>
            <X className="h-4 w-4" />
            {dismissLabel}
          </SecondaryButton>
        }
      >
        <iframe
          title={title}
          srcDoc={html}
          sandbox="allow-forms"
          className="h-[32rem] w-full rounded-md border bg-white"
        />
      </SettingsCard>
    </div>
  );
}

export default function Reconciliation() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const [stripeResult, setStripeResult] = useState<string | null>(null);
  const [stripeReviewHtml, setStripeReviewHtml] = useState<string | null>(null);
  const [posResult, setPosResult] = useState<string | null>(null);
  const [posReviewHtml, setPosReviewHtml] = useState<string | null>(null);

  const stripeScan = trpc.reconciliation.run.useMutation({
    onSuccess: (data) => {
      const msg =
        data.totalPendingReview > 0
          ? t(
              data.emailSent
                ? "ops.reconciliation.stripeFoundSent"
                : "ops.reconciliation.stripeFoundNotSent",
              { count: data.totalPendingReview },
            )
          : data.newNoCandidates > 0
            ? t("ops.reconciliation.stripeNoCandidates", {
                count: data.newNoCandidates,
              })
            : t("ops.reconciliation.stripeClean", {
                count: data.scannedSucceededPayments,
              });
      setStripeResult(msg);
      // The email never left: show its contents here rather than reporting a
      // success the merchant has no way to act on.
      setStripeReviewHtml(data.reviewHtml ?? null);
      if (data.reviewHtml) toast.error(msg);
      else toast.success(msg);
    },
    onError: (e) =>
      toast.error(e.message || t("ops.reconciliation.stripeFailed")),
  });

  const posScan = trpc.reconciliation.runPos.useMutation({
    onSuccess: (data) => {
      const msg =
        data.totalPendingReview > 0
          ? t(
              data.emailSent
                ? "ops.reconciliation.posFoundSent"
                : "ops.reconciliation.posFoundNotSent",
              { count: data.totalPendingReview },
            )
          : data.newNoCandidates > 0
            ? t("ops.reconciliation.posNoCandidates", {
                count: data.newNoCandidates,
              })
            : t("ops.reconciliation.posClean", { count: data.scannedLines });
      setPosResult(msg);
      setPosReviewHtml(data.reviewHtml ?? null);
      if (data.reviewHtml) toast.error(msg);
      else toast.success(msg);
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
        {stripeScan.data?.emailError && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("ops.reconciliation.stripeEmailError", {
              reason: stripeScan.data.emailError,
            })}
          </p>
        )}
      </SettingsCard>

      {stripeReviewHtml && (
        <ReviewPanel
          html={stripeReviewHtml}
          title={t("ops.reconciliation.stripeReviewTitle")}
          description={t("ops.reconciliation.stripeReviewDescription")}
          dismissLabel={t("ops.reconciliation.stripeReviewDismiss")}
          onDismiss={() => setStripeReviewHtml(null)}
        />
      )}

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
        {posScan.data?.emailError && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("ops.reconciliation.posEmailError", {
              reason: posScan.data.emailError,
            })}
          </p>
        )}
      </SettingsCard>

      {posReviewHtml && (
        <ReviewPanel
          html={posReviewHtml}
          title={t("ops.reconciliation.posReviewTitle")}
          description={t("ops.reconciliation.posReviewDescription")}
          dismissLabel={t("ops.reconciliation.posReviewDismiss")}
          onDismiss={() => setPosReviewHtml(null)}
        />
      )}
    </div>
  );
}
