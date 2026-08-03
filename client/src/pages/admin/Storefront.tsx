/**
 * Storefront (store plane) — the tenant's own website branding: logo, brand
 * colour, and SEO meta. All fields persist through tenant.updateSettings (the
 * same procedure the storefront reads to render itself).
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";

export default function Storefront() {
  const { tenant, slug, settings, invalidate } = useTenantSettings();
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  useEffect(() => {
    if (settings) {
      setLogoUrl(settings.logoUrl ?? "");
      setPrimaryColor(settings.primaryColor ?? "#000000");
      setMetaTitle(settings.metaTitle ?? "");
      setMetaDescription(settings.metaDescription ?? "");
    }
  }, [settings]);

  const save = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Storefront updated.");
    },
    onError: (e) => toast.error(e.message || "Could not save."),
  });

  const onSave = () => {
    if (logoUrl && !/^https?:\/\//.test(logoUrl)) {
      toast.error("Logo must be a full URL (https://…).");
      return;
    }
    if (primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      toast.error("Brand colour must be a hex value like #8B6914.");
      return;
    }
    save.mutate({
      logoUrl: logoUrl.trim() || undefined,
      primaryColor: primaryColor || undefined,
      metaTitle: metaTitle.trim() || undefined,
      metaDescription: metaDescription.trim() || undefined,
    });
  };

  const storeUrl = slug ? `https://${slug}.zolto.ch` : null;

  return (
    <div>
      <PageHeader
        title="Storefront"
        description="How your public website looks and appears in search."
        actions={
          storeUrl && (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" />
              View storefront
            </a>
          )
        }
      />

      <SettingsCard
        title="Branding"
        description="Your logo and brand colour appear across your storefront."
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            Save changes
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Logo URL"
            htmlFor="logo-url"
            hint="A hosted image URL. Upload elsewhere and paste the link here."
          >
            <input
              id="logo-url"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
              className={inputClass}
            />
          </Field>
          <Field label="Brand colour" htmlFor="primary-color">
            <div className="flex items-center gap-3">
              <input
                aria-label="Brand colour picker"
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : "#000000"}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 shrink-0 cursor-pointer rounded-md border bg-background"
              />
              <input
                id="primary-color"
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#8B6914"
                className={inputClass}
              />
            </div>
          </Field>
        </div>
        {logoUrl && /^https?:\/\//.test(logoUrl) && (
          <div className="mt-5">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Logo preview
            </p>
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-14 max-w-[220px] object-contain"
            />
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title="Search & sharing (SEO)"
        description="What people see when your store appears in Google or is shared as a link."
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            Save changes
          </PrimaryButton>
        }
      >
        <div className="space-y-5">
          <Field
            label="Page title"
            htmlFor="meta-title"
            hint={`Appears in the browser tab and search results.${tenant?.name ? ` Defaults to "${tenant.name}".` : ""}`}
          >
            <input
              id="meta-title"
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Your store — handcrafted items"
              maxLength={255}
              className={inputClass}
            />
          </Field>
          <Field
            label="Meta description"
            htmlFor="meta-description"
            hint="A one- or two-sentence summary for search engines."
          >
            <textarea
              id="meta-description"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={3}
              placeholder="Carefully selected items, made with care."
              className={`${inputClass} resize-none`}
            />
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}
