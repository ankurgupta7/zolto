/**
 * POS (store plane) — take payments in person: Tap to Pay and TWINT on a phone.
 * Readiness is derived from real state: Tap to Pay needs the tenant's own
 * connected Stripe account (tenant.getStripeConnectUrl.connected); a Terminal
 * Location is provisioned on first use (tenant.me.terminalLocationId). The POS
 * API key that pairs a terminal lives on Keys & access — linked from here.
 */
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
} from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
} from "@/components/admin/ui";

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
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
  const me = trpc.tenant.me.useQuery(undefined, { retry: false });
  const connect = trpc.tenant.getStripeConnectUrl.useQuery(undefined, {
    retry: false,
  });

  const connected = connect.data?.connected ?? false;
  const terminalReady = Boolean(me.data?.terminalLocationId);

  const handleConnect = () => {
    if (connect.data?.url) {
      window.location.href = connect.data.url;
    } else {
      toast.error("Stripe Connect isn't set up on the platform yet.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Point of sale"
        description="Take card and TWINT payments in person — at markets, fairs, or your studio — right from your phone."
      />

      {/* Readiness overview */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Nfc className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Tap to Pay
              </span>
            </div>
            <StatusPill ok={connected}>
              {connected ? "Ready" : "Not set up"}
            </StatusPill>
          </div>
          <p className="text-sm text-muted-foreground">
            Accept contactless cards and phones by tapping them to your device —
            no extra hardware.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                TWINT
              </span>
            </div>
            <StatusPill ok={connected}>
              {connected ? "Ready" : "Not set up"}
            </StatusPill>
          </div>
          <p className="text-sm text-muted-foreground">
            Swiss customers pay with the TWINT app. Enabled automatically once
            payments are connected.
          </p>
        </div>
      </div>

      {/* Step 1 — connect payments */}
      <SettingsCard
        title="1 · Connect payments"
        description="Link your own Stripe account so in-person sales pay out directly to you."
      >
        {connected ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Your Stripe account is connected — payouts go straight to you.
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              You'll be taken to Stripe to connect or create an account. This is
              the same connection used for online checkout.
            </p>
            <PrimaryButton
              onClick={handleConnect}
              loading={connect.isLoading}
              disabled={connect.data?.url == null && !connect.isLoading}
            >
              <CreditCard className="h-4 w-4" />
              Connect Stripe
            </PrimaryButton>
          </div>
        )}
      </SettingsCard>

      {/* Step 2 — pair the terminal */}
      <SettingsCard
        title="2 · Pair your phone"
        description="Your POS app authenticates with your store's POS API key."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Terminal location
              </p>
              <p className="text-xs text-muted-foreground">
                {terminalReady
                  ? "Provisioned — your device is registered for Tap to Pay."
                  : "Created automatically the first time you take a payment."}
              </p>
            </div>
          </div>
          <StatusPill ok={terminalReady}>
            {terminalReady ? "Provisioned" : "Pending first use"}
          </StatusPill>
        </div>

        <div className="mt-5 border-t pt-5">
          <Link
            href="/admin/account/keys"
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <KeyRound className="h-4 w-4" />
            Manage POS API key
          </Link>
        </div>
      </SettingsCard>

      {/* How it works */}
      <SettingsCard title="Taking a payment">
        <ol className="space-y-3">
          {[
            "Open the Zolto POS app on your phone and sign in with your POS API key.",
            "Add the piece — or enter an amount — and choose Tap to Pay or TWINT.",
            "Have the customer tap their card or phone, or scan the TWINT code.",
            "Inventory syncs back here automatically, so a sold piece leaves your online shop too.",
          ].map((step, i) => (
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
