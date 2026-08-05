/**
 * Keys & access (account plane) — the tenant's POS API key. The plaintext key
 * only ever exists client-side for the moment after generation/rotation (the
 * server stores a SHA-256 hash), so this page is the one place it can be copied.
 * Rotating immediately invalidates the old key on every terminal.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { KeyRound, Copy, Check, RefreshCw, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  AdminOnly,
} from "@/components/admin/ui";
import { buildPosPairingPayload } from "@/lib/posPairing";

export default function Keys() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const rotate = trpc.tenant.rotatePosApiKey.useMutation({
    onSuccess: (data) => {
      setPlaintext(data.posApiKey);
      setConfirming(false);
      toast.success(t("store.keys.rotatedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.keys.rotateError")),
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title={t("store.keys.title")}
        description={t("store.keys.description")}
      />

      <SettingsCard
        title={t("store.keys.posTitle")}
        description={t("store.keys.posDescription")}
      >
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("store.keys.rotateWarning")}</p>
        </div>

        {plaintext && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("store.keys.newKeyLabel")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {plaintext}
              </code>
              <button
                type="button"
                aria-label={t("store.keys.copyKeyAria")}
                onClick={() => {
                  navigator.clipboard?.writeText(plaintext);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-md border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Scan-to-pair QR — only renderable in this same moment, since
                the payload needs the plaintext the server never stores. */}
            <div className="mt-5 flex items-start gap-4 rounded-lg border bg-muted/40 p-4">
              <div
                data-testid="pos-pairing-qr"
                className="shrink-0 rounded-md border bg-white p-2"
              >
                <QRCodeSVG
                  value={buildPosPairingPayload(
                    window.location.origin,
                    plaintext,
                  )}
                  size={148}
                  marginSize={0}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {t("store.keys.pairTitle")}
                </p>
                <p className="mt-1">
                  {t("store.keys.pairBefore")}{" "}
                  <span className="text-foreground">
                    {t("store.keys.pairChoice")}
                  </span>{" "}
                  {t("store.keys.pairAfter")}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          {confirming ? (
            <>
              <PrimaryButton
                onClick={() => rotate.mutate()}
                loading={rotate.isPending}
                className="bg-rose-600 hover:bg-rose-700"
              >
                <RefreshCw className="h-4 w-4" />
                {t("store.keys.confirmRotate")}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t("store.keys.cancel")}
              </button>
            </>
          ) : (
            <PrimaryButton onClick={() => setConfirming(true)}>
              <KeyRound className="h-4 w-4" />
              {plaintext ? t("store.keys.rotateAgain") : t("store.keys.generate")}
            </PrimaryButton>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("store.keys.apiTitle")}
        description={t("store.keys.apiDescription")}
      >
        <p className="text-sm text-muted-foreground">
          {t("store.keys.apiNote")}
        </p>
      </SettingsCard>
    </div>
  );
}
