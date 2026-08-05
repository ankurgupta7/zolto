/**
 * Storefront (store plane) — the tenant's own website branding: logo, brand
 * colour, and SEO meta. All fields persist through tenant.updateSettings (the
 * same procedure the storefront reads to render itself).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("admin");
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
      toast.success(t("store.storefront.updatedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.storefront.saveError")),
  });

  const onSave = () => {
    if (logoUrl && !/^https?:\/\//.test(logoUrl)) {
      toast.error(t("store.storefront.invalidLogo"));
      return;
    }
    if (primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      toast.error(t("store.storefront.invalidColor"));
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
        title={t("store.storefront.title")}
        description={t("store.storefront.description")}
        actions={
          storeUrl && (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" />
              {t("store.storefront.viewStorefront")}
            </a>
          )
        }
      />

      <SettingsCard
        title={t("store.storefront.brandingTitle")}
        description={t("store.storefront.brandingDescription")}
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            {t("store.storefront.saveChanges")}
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label={t("store.storefront.logoUrl")}
            htmlFor="logo-url"
            hint={t("store.storefront.logoUrlHint")}
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
          <Field
            label={t("store.storefront.brandColour")}
            htmlFor="primary-color"
          >
            <div className="flex items-center gap-3">
              <input
                aria-label={t("store.storefront.brandColourPickerAria")}
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
              {t("store.storefront.logoPreview")}
            </p>
            <img
              src={logoUrl}
              alt={t("store.storefront.logoPreview")}
              className="h-14 max-w-[220px] object-contain"
            />
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("store.storefront.seoTitle")}
        description={t("store.storefront.seoDescription")}
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            {t("store.storefront.saveChanges")}
          </PrimaryButton>
        }
      >
        <div className="space-y-5">
          <Field
            label={t("store.storefront.pageTitle")}
            htmlFor="meta-title"
            hint={`${t("store.storefront.metaTitleHint")}${tenant?.name ? ` ${t("store.storefront.metaTitleHintDefault", { name: tenant.name })}` : ""}`}
          >
            <input
              id="meta-title"
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder={t("store.storefront.pageTitlePlaceholder")}
              maxLength={255}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("store.storefront.metaDescription")}
            htmlFor="meta-description"
            hint={t("store.storefront.metaDescriptionHint")}
          >
            <textarea
              id="meta-description"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={3}
              placeholder={t("store.storefront.metaDescriptionPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}
