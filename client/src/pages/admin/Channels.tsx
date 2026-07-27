/**
 * Channels (store plane) — the ways products and customers reach the shop:
 * WhatsApp enquiries, the Instagram handle + curated post grid, and the Discord
 * intake bot. Contact/handle/Discord IDs persist via tenant.updateSettings; the
 * curated grid reuses the existing InstagramManager (instagram.* router).
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MessageCircle, Instagram, Hash } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";
import InstagramManager from "@/components/InstagramManager";

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
    </div>
  );
}
