/**
 * Channels (store plane) — the ways products and customers reach the shop:
 * WhatsApp enquiries, the Instagram handle + curated post grid, and the Discord
 * intake bot. Contact/handle/Discord IDs persist via tenant.updateSettings; the
 * curated grid reuses the existing InstagramManager (instagram.* router).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MessageCircle, Instagram, Hash, KeyRound, Slack } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";
import { VERTICAL_PRESETS, isVertical } from "@shared/verticals";
import InstagramManager from "@/components/InstagramManager";

/**
 * The credentials a merchant can bring for each intake channel. Stored in the
 * encrypted tenant-secrets vault — write-only: the UI only ever sees the
 * last-4 hint, never the value back. Labels/notes/wordy placeholders are
 * locale keys under store.channels.credentials.*; channel names are brands
 * and stay as-is.
 */
const CREDENTIAL_GROUPS: {
  channel: string;
  noteKey: string;
  providers: {
    id: string;
    labelKey: string;
    /** Either a literal token shape (kept as-is) or a locale key. */
    placeholder?: string;
    placeholderKey?: string;
  }[];
}[] = [
  {
    channel: "WhatsApp",
    noteKey: "store.channels.credentials.whatsappNote",
    providers: [
      {
        id: "whatsapp_token",
        labelKey: "store.channels.credentials.accessToken",
        placeholder: "EAAG…",
      },
      {
        id: "whatsapp_app_secret",
        labelKey: "store.channels.credentials.appSecret",
        placeholderKey: "store.channels.credentials.appSecretPlaceholder",
      },
    ],
  },
  {
    channel: "Slack",
    noteKey: "store.channels.credentials.slackNote",
    providers: [
      {
        id: "slack_bot_token",
        labelKey: "store.channels.credentials.botToken",
        placeholder: "xoxb-…",
      },
      {
        id: "slack_signing_secret",
        labelKey: "store.channels.credentials.signingSecret",
        placeholderKey: "store.channels.credentials.signingSecretPlaceholder",
      },
    ],
  },
  {
    channel: "Discord",
    noteKey: "store.channels.credentials.discordNote",
    providers: [
      {
        id: "discord_bot_token",
        labelKey: "store.channels.credentials.botToken",
        placeholderKey: "store.channels.credentials.discordTokenPlaceholder",
      },
    ],
  },
];

function ChannelCredentials() {
  const { t } = useTranslation("admin");
  const utils = trpc.useUtils();
  const secretsQuery = trpc.tenant.channelSecrets.useQuery();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const setSecret = trpc.tenant.setChannelSecret.useMutation({
    onSuccess: (data) => {
      setDrafts((d) => ({ ...d, [data.provider]: "" }));
      utils.tenant.channelSecrets.invalidate();
      toast.success(t("store.channels.credentials.savedToast"));
    },
    onError: (e) =>
      toast.error(e.message || t("store.channels.credentials.saveError")),
  });
  const deleteSecret = trpc.tenant.deleteChannelSecret.useMutation({
    onSuccess: () => {
      utils.tenant.channelSecrets.invalidate();
      toast.success(t("store.channels.credentials.removedToast"));
    },
    onError: (e) =>
      toast.error(e.message || t("store.channels.credentials.removeError")),
  });

  const stored = new Map(
    (secretsQuery.data?.secrets ?? []).map((s) => [s.provider as string, s]),
  );
  const vaultConfigured = secretsQuery.data?.vaultConfigured ?? true;

  return (
    <SettingsCard
      title={t("store.channels.credentials.title")}
      description={t("store.channels.credentials.description")}
    >
      {!vaultConfigured && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {t("store.channels.credentials.vaultWarning")}
        </div>
      )}
      <div className="grid gap-6">
        {CREDENTIAL_GROUPS.map((group) => (
          <div key={group.channel}>
            <p className="text-sm font-medium text-foreground">
              {group.channel}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(group.noteKey)}
            </p>
            <div className="mt-3 grid gap-4">
              {group.providers.map((p) => {
                const existing = stored.get(p.id);
                return (
                  <Field
                    key={p.id}
                    label={t(p.labelKey)}
                    htmlFor={`cred-${p.id}`}
                    hint={
                      existing
                        ? t("store.channels.credentials.savedHint", {
                            hint: existing.hint,
                          })
                        : t("store.channels.credentials.notSetHint")
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
                        placeholder={
                          p.placeholderKey ? t(p.placeholderKey) : p.placeholder
                        }
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
                        {t("store.channels.credentials.save")}
                      </PrimaryButton>
                      {existing && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() =>
                            deleteSecret.mutate({ provider: p.id as never })
                          }
                        >
                          {t("store.channels.credentials.remove")}
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
  const { t } = useTranslation("admin");
  const { settings, invalidate } = useTenantSettings();
  // Vertical-specific example message for the intake bots.
  const intakeExample =
    VERTICAL_PRESETS[
      settings?.vertical && isVertical(settings.vertical)
        ? settings.vertical
        : "jewellery"
    ].exampleIntakeMessage;
  const connect = trpc.tenant.channelConnect.useQuery();
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [discordOwnerUserId, setDiscordOwnerUserId] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");

  useEffect(() => {
    if (settings) {
      setWhatsappNumber(settings.whatsappNumber ?? "");
      setInstagramHandle(settings.instagramHandle ?? "");
      setDiscordChannelId(settings.discordChannelId ?? "");
      setDiscordOwnerUserId(settings.discordOwnerUserId ?? "");
      setSlackChannelId(settings.slackChannelId ?? "");
    }
  }, [settings]);

  // Landing back from the Add-to-Slack OAuth redirect: surface the outcome
  // once, then drop the query param so a refresh doesn't re-toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slack = params.get("slack");
    if (!slack) return;
    if (slack === "connected") {
      toast.success(t("store.channels.slackConnectedToast"));
    } else {
      toast.error(t("store.channels.slackFailedToast"));
    }
    params.delete("slack");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("store.channels.updatedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.channels.saveError")),
  });

  const saveContact = () =>
    save.mutate({
      whatsappNumber: whatsappNumber.trim() || undefined,
      instagramHandle: instagramHandle.trim().replace(/^@/, "") || undefined,
    });

  const saveDiscord = () => {
    if (discordChannelId && !/^\d{17,20}$/.test(discordChannelId.trim())) {
      toast.error(t("store.channels.discordChannelInvalid"));
      return;
    }
    if (discordOwnerUserId && !/^\d{17,20}$/.test(discordOwnerUserId.trim())) {
      toast.error(t("store.channels.discordUserInvalid"));
      return;
    }
    save.mutate({
      discordChannelId: discordChannelId.trim() || undefined,
      discordOwnerUserId: discordOwnerUserId.trim() || undefined,
    });
  };

  const saveSlack = () => {
    if (
      slackChannelId &&
      !/^[A-Z][A-Z0-9]{4,20}$/i.test(slackChannelId.trim())
    ) {
      toast.error(t("store.channels.slackChannelInvalid"));
      return;
    }
    save.mutate({ slackChannelId: slackChannelId.trim() || undefined });
  };

  return (
    <div>
      <PageHeader
        title={t("store.channels.title")}
        description={t("store.channels.description")}
      />

      <SettingsCard
        title={t("store.channels.contactTitle")}
        description={t("store.channels.contactDescription")}
        footer={
          <PrimaryButton onClick={saveContact} loading={save.isPending}>
            {t("store.channels.saveChanges")}
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label={t("store.channels.whatsappLabel")}
            htmlFor="whatsapp"
            hint={t("store.channels.whatsappHint")}
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
          <Field label={t("store.channels.instagramLabel")} htmlFor="instagram">
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
        title={t("store.channels.igGridTitle")}
        description={t("store.channels.igGridDescription")}
      >
        <InstagramManager />
      </SettingsCard>

      <SettingsCard
        title={t("store.channels.discordTitle")}
        description={t("store.channels.discordDescription")}
        footer={
          <PrimaryButton onClick={saveDiscord} loading={save.isPending}>
            {t("store.channels.saveChanges")}
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label={t("store.channels.discordChannelLabel")}
            htmlFor="discord-channel"
            hint={t("store.channels.discordChannelHint")}
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
            label={t("store.channels.discordOwnerLabel")}
            htmlFor="discord-owner"
            hint={t("store.channels.discordOwnerHint")}
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
          <p className="font-medium text-foreground">
            {t("store.channels.exampleMessage")}
          </p>
          <p className="mt-1 font-mono">{intakeExample}</p>
          {connect.data?.discordInviteUrl && (
            <p className="mt-3">
              {t("store.channels.discordFirstStep")}{" "}
              <a
                href={connect.data.discordInviteUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                {t("store.channels.discordInviteLink")}
              </a>{" "}
              {t("store.channels.discordThen")}
            </p>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("store.channels.slackTitle")}
        description={t("store.channels.slackDescription")}
        footer={
          <PrimaryButton onClick={saveSlack} loading={save.isPending}>
            {t("store.channels.saveChanges")}
          </PrimaryButton>
        }
      >
        {connect.data?.slackAuthorizeUrl && (
          <div className="mb-5">
            <a
              href={connect.data.slackAuthorizeUrl}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Slack className="h-4 w-4" />
              {t("store.channels.addToSlack")}
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("store.channels.slackOneClick")}
            </p>
          </div>
        )}
        <Field
          label={t("store.channels.slackChannelLabel")}
          htmlFor="slack-channel"
          hint={t("store.channels.slackChannelHint")}
        >
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 shrink-0 text-emerald-600" />
            <input
              id="slack-channel"
              type="text"
              value={slackChannelId}
              onChange={(e) => setSlackChannelId(e.target.value)}
              placeholder="C0123ABCDEF"
              className={inputClass}
            />
          </div>
        </Field>
      </SettingsCard>

      <ChannelCredentials />
    </div>
  );
}
