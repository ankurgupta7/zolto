/**
 * Keys & access (account plane) — the tenant's POS API key. The plaintext key
 * only ever exists client-side for the moment after generation/rotation (the
 * server stores a SHA-256 hash), so this page is the one place it can be copied.
 * Rotating immediately invalidates the old key on every terminal.
 */
import { useState } from "react";
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
  const { user } = useAuth();
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const rotate = trpc.tenant.rotatePosApiKey.useMutation({
    onSuccess: (data) => {
      setPlaintext(data.posApiKey);
      setConfirming(false);
      toast.success(
        "New POS key generated. Copy it now — it won't be shown again.",
      );
    },
    onError: (e) => toast.error(e.message || "Could not rotate the key."),
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title="Keys & access"
        description="Credentials that connect your terminals and tools to this store."
      />

      <SettingsCard
        title="POS API key"
        description="Your point-of-sale app authenticates with this key. It's stored hashed — we can't show an existing key, only replace it."
      >
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Rotating the key immediately stops the old one from working. Every
            terminal will need the new key re-entered before it can take
            payments again.
          </p>
        </div>

        {plaintext && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your new key — copy it now
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {plaintext}
              </code>
              <button
                type="button"
                aria-label="Copy key"
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
                  Or pair by scanning
                </p>
                <p className="mt-1">
                  In the Zolto POS app, choose{" "}
                  <span className="text-foreground">Scan to pair</span> and
                  point the camera here — the server address and key are set in
                  one go. The code disappears when you leave this page, and
                  anyone who scans it can take payments for your store, so treat
                  it like the key itself.
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
                Yes, rotate the key
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </>
          ) : (
            <PrimaryButton onClick={() => setConfirming(true)}>
              <KeyRound className="h-4 w-4" />
              {plaintext ? "Rotate again" : "Generate a new key"}
            </PrimaryButton>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Public API access"
        description="Programmatic access to your catalogue and orders."
      >
        <p className="text-sm text-muted-foreground">
          A public API for building your own integrations is part of a future
          Business plan and is coming soon. It'll live here when it's ready.
        </p>
      </SettingsCard>
    </div>
  );
}
