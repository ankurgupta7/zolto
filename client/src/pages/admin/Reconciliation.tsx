/**
 * Reconciliation (store plane) — day-end tidying of sales that arrived without
 * a clean product match. Two scans, both from the reconciliation.* router:
 *   • Stripe payments missing from our records → email a match request.
 *   • Amount-only in-person sales with no piece attached → email a confirm link.
 * Each scan is idempotent; the merchant runs it and confirms guesses by email.
 */
import { useState } from "react";
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
  const { user } = useAuth();
  const [stripeResult, setStripeResult] = useState<string | null>(null);
  const [posResult, setPosResult] = useState<string | null>(null);

  const stripeScan = trpc.reconciliation.run.useMutation({
    onSuccess: (data) => {
      const msg =
        data.newPendingReview > 0
          ? `${data.newPendingReview} unmatched payment${data.newPendingReview === 1 ? "" : "s"} found — ${data.emailSent ? "a review email was sent." : "but the review email could not be sent."}`
          : data.newNoCandidates > 0
            ? `${data.newNoCandidates} unmatched payment${data.newNoCandidates === 1 ? "" : "s"} found, but no in-stock piece was close enough in price to guess.`
            : `No unmatched Stripe payments found (${data.scannedSucceededPayments} checked).`;
      setStripeResult(msg);
      toast.success(msg);
    },
    onError: (e) => toast.error(e.message || "Stripe reconciliation failed."),
  });

  const posScan = trpc.reconciliation.runPos.useMutation({
    onSuccess: (data) => {
      const msg =
        data.newPendingReview > 0
          ? `${data.newPendingReview} sale${data.newPendingReview === 1 ? "" : "s"} to confirm — ${data.emailSent ? "a review email was sent." : "but the review email could not be sent."}`
          : data.newNoCandidates > 0
            ? `${data.newNoCandidates} sale${data.newNoCandidates === 1 ? "" : "s"} found, but no in-stock piece was close enough in price to guess.`
            : `No unattributed in-person sales found (${data.scannedLines} checked).`;
      setPosResult(msg);
      toast.success(msg);
    },
    onError: (e) =>
      toast.error(e.message || "In-person reconciliation failed."),
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        description="Catch sales that slipped through without a clean match, and tie each one back to the right piece."
      />

      <SettingsCard
        title="Stripe payments"
        description="Scan recent payments on your own Stripe account for any missing from your records, and email a match request for each."
        footer={
          <PrimaryButton
            onClick={() => stripeScan.mutate({})}
            loading={stripeScan.isPending}
          >
            <CreditCard className="h-4 w-4" />
            Reconcile Stripe payments
          </PrimaryButton>
        }
      >
        {stripeResult ? (
          <p className="text-sm text-foreground">{stripeResult}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Reads your connected Stripe account — the one your customers pay
            into. Best run at the end of a selling day. We'll never double-count
            a payment already in your orders.
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title="In-person sales"
        description="Find amount-only POS sales (cash, card, or TWINT) with no piece attached and email a one-click confirm for the likely match."
        footer={
          <PrimaryButton
            onClick={() => posScan.mutate({})}
            loading={posScan.isPending}
          >
            <Receipt className="h-4 w-4" />
            Confirm in-person sales
          </PrimaryButton>
        }
      >
        {posResult ? (
          <p className="text-sm text-foreground">{posResult}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sold a piece at a market for a round number without scanning it?
            This finds it and asks you to confirm which piece it was.
          </p>
        )}
      </SettingsCard>
    </div>
  );
}
