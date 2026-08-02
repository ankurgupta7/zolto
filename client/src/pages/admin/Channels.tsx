/**
 * Channels (store plane) — the ways products and customers reach the shop:
 * WhatsApp enquiries, the Instagram handle + curated post grid, and the Discord
 * intake bot. Contact/handle/Discord IDs persist via tenant.updateSettings; the
 * curated grid reuses the existing InstagramManager (instagram.* router).
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MessageCircle, Instagram, Hash, KeyRound } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";
import InstagramManager from "@/components/InstagramManager";

/**
 * The credentials a merchant can bring for each intake channel. Stored in the
 * encrypted tenant-secrets vault — write-only: the UI only ever sees the
 * last-4 hint, never the value back.
 */
const CREDENTIAL_GROUPS: {
  channel: string;
  note: string;
  providers: { id: string; label: string; placeholder: string }[];
}[] = [
  {
    channel: "WhatsApp",
    note: "From your own Meta app (WhatsApp > API setup) if you don't use the platform's.",
    providers: [
      {
        id: "whatsapp_token",
        label: "Access token",
        placeholder: "EAAG…",
      },
      {
        id: "whatsapp_app_secret",
        label: "App secret",
        placeholder: "32-char hex from Meta app settings",
      },
    ],
  },
  {
    channel: "Slack",
    note: "From your own Slack app installed in your workspace.",
    providers: [
      { id: "slack_bot_token", label: "Bot token", placeholder: "xoxb-…" },
      {
        id: "slack_signing_secret",
        label: "Signing secret",
        placeholder: "From your app's Basic Information page",
      },
    ],
  },
  {
    channel: "Discord",
    note: "From your own bot in the Discord Developer Portal. The bot connects within a minute of saving.",
    providers: [
      {
        id: "discord_bot_token",
        label: "Bot token",
        placeholder: "From Bot > Token",
      },
    ],
  },
];

function ChannelCredentials() {
  const utils = trpc.useUtils();
  const secretsQuery = trpc.tenant.channelSecrets.useQuery();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const setSecret = trpc.tenant.setChannelSecret.useMutation({
    onSuccess: (data) => {
      setDrafts((d) => ({ ...d, [data.provider]: "" }));
      utils.tenant.channelSecrets.invalidate();
      toast.success("Credential saved.");
    },
    onError: (e) => toast.error(e.message || "Could not save credential."),
  });
  const deleteSecret = trpc.tenant.deleteChannelSecret.useMutation({
    onSuccess: () => {
      utils.tenant.channelSecrets.invalidate();
      toast.success("Credential removed — the platform default applies again.");
    },
    onError: (e) => toast.error(e.message || "Could not remove credential."),
  });

  const stored = new Map(
    (secretsQuery.data?.secrets ?? []).map((s) => [s.provider as string, s]),
  );
  const vaultConfigured = secretsQuery.data?.vaultConfigured ?? true;

  return (
    <SettingsCard
      title="Your own bot credentials (advanced)"
      description="By default your store uses Zolto's WhatsApp, Slack and Discord apps — nothing to configure. Paste credentials here only if you run your own. They're stored encrypted and can never be read back, only replaced or removed."
    >
      {!vaultConfigured && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          This deployment has no secrets vault configured (TENANT_SECRETS_KEY),
          so credentials can't be stored yet. The platform-level defaults still
          work.
        </div>
      )}
      <div className="grid gap-6">
        {CREDENTIAL_GROUPS.map((group) => (
          <div key={group.channel}>
            <p className="text-sm font-medium text-foreground">
              {group.channel}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{group.note}</p>
            <div className="mt-3 grid gap-4">
              {group.providers.map((p) => {
                const existing = stored.get(p.id);
                return (
                  <Field
                    key={p.id}
                    label={p.label}
                    htmlFor={`cred-${p.id}`}
                    hint={
                      existing
                        ? `Saved (…${existing.hint}) — enter a new value to rotate.`
                        : "Not set — the platform default applies."
                    }
                  >
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        id={`cred-${p.id}`}
                        type="password"
                        autoComplete="off"
                        value={drafts[p.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                        }
                        placeholder={p.placeholder}
                        className={inputClass}
                        disabled={!vaultConfigured}
                      />
                      <PrimaryButton
                        onClick={() =>
                          setSecret.mutate({
                            provider: p.id as never,
                            value: (drafts[p.id] ?? "").trim(),
                          })
                        }
                        loading={setSecret.isPending}
                        disabled={
                          !vaultConfigured ||
                          (drafts[p.id] ?? "").trim().length < 8
                        }
                      >
                        Save
                      </PrimaryButton>
                      {existing && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() =>
                            deleteSecret.mutate({ provider: p.id as never })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </Field>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

export default function Channels() {
  const { settings, invalidate } = useTenantSettings();
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [discordOwnerUserId, setDiscordOwnerUserId] = useState("");

  useEffect(() => {
    if (settings) {
      setWhatsappNumber(settings.whatsappNumber ?? "");
      setInstagramHandle(settings.instagramHandle ?? "");
      setDiscordChannelId(settings.discordChannelId ?? "");
      setDiscordOwnerUserId(settings.discordOwnerUserId ?? "");
    }
  }, [settings]);

  const save = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Channels updated.");
    },
    onError: (e) => toast.error(e.message || "Could not save."),
  });

  const saveContact = () =>
    save.mutate({
      whatsappNumber: whatsappNumber.trim() || undefined,
      instagramHandle: instagramHandle.trim().replace(/^@/, "") || undefined,
    });

  const saveDiscord = () => {
    if (discordChannelId && !/^\d{17,20}$/.test(discordChannelId.trim())) {
      toast.error("A Discord channel ID is a 17–20 digit number.");
      return;
    }
    if (discordOwnerUserId && !/^\d{17,20}$/.test(discordOwnerUserId.trim())) {
      toast.error("A Discord user ID is a 17–20 digit number.");
      return;
    }
    save.mutate({
      discordChannelId: discordChannelId.trim() || undefined,
      discordOwnerUserId: discordOwnerUserId.trim() || undefined,
    });
  };

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Connect the places your customers find you and your products come from."
      />

      <SettingsCard
        title="Contact channels"
        description="Where customers reach you from the storefront."
        footer={
          <PrimaryButton onClick={saveContact} loading={save.isPending}>
            Save changes
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="WhatsApp number"
            htmlFor="whatsapp"
            hint="Used for the storefront enquiry button (with country code)."
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 shrink-0 text-emerald-500" />
              <input
                id="whatsapp"
                type="tel"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="+41 79 000 00 00"
                className={inputClass}
              />
            </div>
          </Field>
          <Field label="Instagram handle" htmlFor="instagram">
            <div className="flex items-center gap-2">
              <Instagram className="h-4 w-4 shrink-0 text-pink-500" />
              <input
                id="instagram"
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                placeholder="yourstore"
                className={inputClass}
              />
            </div>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Instagram grid"
        description="Curate posts to feature on your storefront home page."
      >
        <InstagramManager />
      </SettingsCard>

      <SettingsCard
        title="Discord intake"
        description="Post a photo, description, and price in your connected channel and the bot adds the product to your catalogue automatically."
        footer={
          <PrimaryButton onClick={saveDiscord} loading={save.isPending}>
            Save changes
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Channel ID"
            htmlFor="discord-channel"
            hint="Right-click your channel → Copy Channel ID (Developer Mode on)."
          >
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 shrink-0 text-indigo-400" />
              <input
                id="discord-channel"
                type="text"
                value={discordChannelId}
                onChange={(e) => setDiscordChannelId(e.target.value)}
                placeholder="123456789012345678"
                className={inputClass}
              />
            </div>
          </Field>
          <Field
            label="Your Discord user ID"
            htmlFor="discord-owner"
            hint="For order notifications sent to you directly."
          >
            <input
              id="discord-owner"
              type="text"
              value={discordOwnerUserId}
              onChange={(e) => setDiscordOwnerUserId(e.target.value)}
              placeholder="123456789012345678"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Example message</p>
          <p className="mt-1 font-mono">
            Sterling silver moonstone ring. Delicate band with an 8mm round
            moonstone, oxidised finish. Price: CHF 220
          </p>
        </div>
      </SettingsCard>

      <ChannelCredentials />
    </div>
  );
}
