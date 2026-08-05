/**
 * POS (store plane) — take payments in person: Tap to Pay and TWINT on a phone.
 * Readiness is derived from real state: Tap to Pay needs the tenant's own
 * connected Stripe account (tenant.getStripeConnectUrl.connected); a Terminal
 * Location is provisioned on first use (tenant.me.terminalLocationId). The POS
 * API key that pairs a terminal lives on Keys & access — linked from here.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Nfc,
  CreditCard,
  Smartphone,
  CheckCircle2,
  XCircle,
  KeyRound,
  MapPin,
  QrCode,
  Upload,
  Trash2,
} from "lucide-react";
import { PageHeader, SettingsCard, PrimaryButton } from "@/components/admin/ui";
import PosAppCard from "@/components/admin/PosAppCard";

function StatusPill({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5" />
      )}
      {children}
    </span>
  );
}

export default function Pos() {
  const { t } = useTranslation("admin");
  const utils = trpc.useUtils();
  const me = trpc.tenant.me.useQuery(undefined, { retry: false });
  const connect = trpc.tenant.getStripeConnectUrl.useQuery(undefined, {
    retry: false,
  });
  const settings = trpc.tenant.getSettings.useQuery(
    { slug: me.data?.slug ?? "" },
    { enabled: Boolean(me.data?.slug), retry: false },
  );

  const connected = connect.data?.connected ?? false;
  const terminalReady = Boolean(me.data?.terminalLocationId);
  const twintQrUrl = settings.data?.twintQrUrl ?? null;

  // The address the register app is pointed at on first launch. The app
  // resolves which store it belongs to from the POS API key, not the host, so
  // the admin's own origin is a correct and recognisable answer.
  const serverUrl =
    typeof window === "undefined" ? "https://zolto.ch" : window.location.origin;

  const qrInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const setTwintQr = trpc.tenant.setTwintQr.useMutation({
    onSuccess: () => {
      utils.tenant.getSettings.invalidate();
      setUploading(false);
    },
    onError: (e) => {
      toast.error(e.message);
      setUploading(false);
    },
  });

  const MAX_QR_BYTES = 5 * 1024 * 1024;
  const QR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

  const handleQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!(QR_TYPES as readonly string[]).includes(file.type)) {
      toast.error(t("ops.pos.errQrType"));
      return;
    }
    if (file.size > MAX_QR_BYTES) {
      toast.error(t("ops.pos.errQrSize"));
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setTwintQr.mutate({
        imageData: String(reader.result),
        mimeType: file.type as (typeof QR_TYPES)[number],
      });
    };
    reader.onerror = () => {
      toast.error(t("ops.pos.errQrRead"));
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleConnect = () => {
    if (connect.data?.url) {
      window.location.href = connect.data.url;
    } else {
      toast.error(t("ops.pos.connectMissing"));
    }
  };

  const howSteps = [
    t("ops.pos.howStep1"),
    t("ops.pos.howStep2"),
    t("ops.pos.howStep3"),
    t("ops.pos.howStep4"),
  ];

  return (
    <div>
      <PageHeader
        title={t("ops.pos.title")}
        description={t("ops.pos.description")}
      />

      {/* Readiness overview */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Nfc className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("ops.pos.tapToPay")}
              </span>
            </div>
            <StatusPill ok={connected}>
              {connected ? t("ops.pos.ready") : t("ops.pos.notSetUp")}
            </StatusPill>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("ops.pos.tapToPayBody")}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("ops.pos.twint")}
              </span>
            </div>
            <StatusPill ok={connected}>
              {connected ? t("ops.pos.ready") : t("ops.pos.notSetUp")}
            </StatusPill>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("ops.pos.twintBody")}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("ops.pos.twintQrSticker")}
              </span>
            </div>
            <StatusPill ok={Boolean(twintQrUrl)}>
              {twintQrUrl ? t("ops.pos.ready") : t("ops.pos.notUploaded")}
            </StatusPill>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("ops.pos.qrCardBody")}
          </p>
        </div>
      </div>

      {/* Step 1 — connect payments */}
      <SettingsCard
        title={t("ops.pos.step1Title")}
        description={t("ops.pos.step1Description")}
      >
        {connected ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            {t("ops.pos.connectedNote")}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {t("ops.pos.connectIntro")}
            </p>
            <PrimaryButton
              onClick={handleConnect}
              loading={connect.isLoading}
              disabled={connect.data?.url == null && !connect.isLoading}
            >
              <CreditCard className="h-4 w-4" />
              {t("ops.pos.connectStripe")}
            </PrimaryButton>
          </div>
        )}
      </SettingsCard>

      {/* Step 2 — get the register app. Previously absent: the page explained
          how to connect payments and where the API key lived, but never where
          to get the app those things are for. */}
      <SettingsCard
        title={t("ops.pos.step2Title")}
        description={t("ops.pos.step2Description")}
      >
        <PosAppCard serverUrl={serverUrl} />
      </SettingsCard>

      {/* Step 3 — pair the terminal */}
      <SettingsCard
        title={t("ops.pos.step3Title")}
        description={t("ops.pos.step3Description")}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("ops.pos.terminalLocation")}
              </p>
              <p className="text-xs text-muted-foreground">
                {terminalReady
                  ? t("ops.pos.terminalProvisionedNote")
                  : t("ops.pos.terminalPendingNote")}
              </p>
            </div>
          </div>
          <StatusPill ok={terminalReady}>
            {terminalReady
              ? t("ops.pos.provisioned")
              : t("ops.pos.pendingFirstUse")}
          </StatusPill>
        </div>

        <div className="mt-5 border-t pt-5">
          <Link
            href="/admin/account/keys"
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <KeyRound className="h-4 w-4" />
            {t("ops.pos.manageKey")}
          </Link>
        </div>
      </SettingsCard>

      {/* TWINT QR sticker */}
      <SettingsCard
        title={t("ops.pos.step4Title")}
        description={t("ops.pos.step4Description")}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            {twintQrUrl ? (
              <img
                src={twintQrUrl}
                alt={t("ops.pos.qrAlt")}
                className="h-full w-full rounded-lg object-contain p-2"
              />
            ) : (
              <QrCode className="h-10 w-10 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {t("ops.pos.qrExplain1")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ops.pos.qrExplain2")}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <input
                ref={qrInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleQrFile}
              />
              <PrimaryButton
                onClick={() => qrInputRef.current?.click()}
                loading={uploading}
              >
                <Upload className="h-4 w-4" />
                {twintQrUrl ? t("ops.pos.replaceImage") : t("ops.pos.uploadQr")}
              </PrimaryButton>
              {twintQrUrl && (
                <button
                  type="button"
                  onClick={() => setTwintQr.mutate({ imageData: null })}
                  disabled={setTwintQr.isPending}
                  className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("ops.pos.remove")}
                </button>
              )}
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* How it works */}
      <SettingsCard title={t("ops.pos.howTitle")}>
        <ol className="space-y-3">
          {howSteps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5 text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </SettingsCard>
    </div>
  );
}
