/**
 * Storefront (store plane) — the tenant's own website: display name, logo,
 * brand colours, the words on its home and About pages, and SEO meta. All
 * fields persist through tenant.updateSettings (the same procedure the
 * storefront reads to render itself).
 *
 * Every content field is optional and clears back to null, because null is
 * what makes the storefront fall back to the generated template copy in
 * client/src/lib/storefrontContent.ts. A merchant emptying a box gets the
 * default back, not a blank page — so nothing here can leave a store worse
 * off than never having opened it.
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
import { featuresForPlan } from "@shared/platform";
import { BRAND } from "@shared/brand";

export default function Storefront() {
  const { t } = useTranslation("admin");
  const { tenant, slug, settings, invalidate } = useTenantSettings();
  const [displayName, setDisplayName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroHeadline, setHeroHeadline] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [aboutBody, setAboutBody] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [hidePlatformCredit, setHidePlatformCredit] = useState(false);

  // Whether this store MAY hide the credit. The server enforces the same rule
  // in updateSettings (docs/ARCHITECTURE-ADMIN.md §4) — this only decides
  // whether the merchant sees a switch or an upsell.
  const canWhiteLabel = featuresForPlan(tenant?.plan ?? "free").whiteLabel;

  useEffect(() => {
    if (settings) {
      setDisplayName(settings.whiteLabelName ?? "");
      setLogoUrl(settings.logoUrl ?? "");
      setPrimaryColor(settings.primaryColor ?? "#000000");
      // Empty means "derive the accent from the primary" — the pre-two-color
      // behaviour, and what a store that never picked a highlight still wants.
      setSecondaryColor(settings.secondaryColor ?? "");
      setHeroImageUrl(settings.heroImageUrl ?? "");
      setHeroHeadline(settings.heroHeadline ?? "");
      setHeroSubtitle(settings.heroSubtitle ?? "");
      setAboutBody(settings.aboutBody ?? "");
      setMetaTitle(settings.metaTitle ?? "");
      setMetaDescription(settings.metaDescription ?? "");
      setHidePlatformCredit(settings.hidePlatformCredit ?? false);
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
    if (secondaryColor && !/^#[0-9A-Fa-f]{6}$/.test(secondaryColor)) {
      toast.error(t("store.storefront.invalidSecondaryColor"));
      return;
    }
    if (heroImageUrl.trim() && !/^https?:\/\//.test(heroImageUrl.trim())) {
      toast.error(t("store.storefront.invalidHeroImage"));
      return;
    }
    save.mutate({
      logoUrl: logoUrl.trim() || undefined,
      primaryColor: primaryColor || undefined,
      secondaryColor: secondaryColor || undefined,
      metaTitle: metaTitle.trim() || undefined,
      metaDescription: metaDescription.trim() || undefined,
      // `|| null` rather than `|| undefined`: these are the merchant's own
      // words, and emptying the box has to actually delete them and restore
      // the generated copy. `undefined` would silently leave the old text in
      // place — the field would look cleared and the storefront would not be.
      whiteLabelName: displayName.trim() || null,
      heroImageUrl: heroImageUrl.trim() || null,
      heroHeadline: heroHeadline.trim() || null,
      heroSubtitle: heroSubtitle.trim() || null,
      aboutBody: aboutBody.trim() || null,
      // Never send `true` from a plan that can't have it: the server would
      // reject the whole save, taking the merchant's unrelated edits on this
      // page down with it.
      hidePlatformCredit: canWhiteLabel ? hidePlatformCredit : false,
    });
  };

  const storeUrl = slug ? `https://${slug}.gwinn.ch` : null;

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
            label={t("store.storefront.displayName")}
            htmlFor="display-name"
            hint={t("store.storefront.displayNameHint", {
              name: tenant?.name ?? "",
            })}
          >
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tenant?.name ?? ""}
              maxLength={255}
              className={inputClass}
            />
          </Field>
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
            label={t("store.storefront.primaryColour")}
            htmlFor="primary-color"
            hint={t("store.storefront.primaryColourHint")}
          >
            <div className="flex items-center gap-3">
              <input
                aria-label={t("store.storefront.primaryColourPickerAria")}
                type="color"
                value={
                  /^#[0-9A-Fa-f]{6}$/.test(primaryColor)
                    ? primaryColor
                    : "#000000"
                }
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
          <Field
            label={t("store.storefront.secondaryColour")}
            htmlFor="secondary-color"
            hint={t("store.storefront.secondaryColourHint")}
          >
            <div className="flex items-center gap-3">
              <input
                aria-label={t("store.storefront.secondaryColourPickerAria")}
                type="color"
                value={
                  /^#[0-9A-Fa-f]{6}$/.test(secondaryColor)
                    ? secondaryColor
                    : "#B8963E"
                }
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-14 shrink-0 cursor-pointer rounded-md border bg-background"
              />
              <input
                id="secondary-color"
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="#B8963E"
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
        title={t("store.storefront.contentTitle")}
        description={t("store.storefront.contentDescription")}
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            {t("store.storefront.saveChanges")}
          </PrimaryButton>
        }
      >
        <div className="space-y-5">
          <Field
            label={t("store.storefront.heroImageUrl")}
            htmlFor="hero-image-url"
            hint={t("store.storefront.heroImageUrlHint")}
          >
            <input
              id="hero-image-url"
              type="url"
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="https://…/shopfront.jpg"
              className={inputClass}
            />
          </Field>
          {heroImageUrl && /^https?:\/\//.test(heroImageUrl) && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("store.storefront.heroImagePreview")}
              </p>
              {/* Same 16:9-ish crop the hero band applies, so a photo whose
                  subject sits at the edge is visibly wrong here rather than
                  only on the live storefront. */}
              <img
                src={heroImageUrl}
                alt={t("store.storefront.heroImagePreview")}
                className="h-32 w-full max-w-md rounded border object-cover object-center"
              />
            </div>
          )}
          <Field
            label={t("store.storefront.heroHeadline")}
            htmlFor="hero-headline"
            hint={t("store.storefront.heroHeadlineHint", {
              name: tenant?.name ?? "",
            })}
          >
            <input
              id="hero-headline"
              type="text"
              value={heroHeadline}
              onChange={(e) => setHeroHeadline(e.target.value)}
              placeholder={t("store.storefront.heroHeadlinePlaceholder")}
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("store.storefront.heroSubtitle")}
            htmlFor="hero-subtitle"
            hint={t("store.storefront.heroSubtitleHint")}
          >
            <textarea
              id="hero-subtitle"
              value={heroSubtitle}
              onChange={(e) => setHeroSubtitle(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder={t("store.storefront.heroSubtitlePlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </Field>
          <Field
            label={t("store.storefront.aboutBody")}
            htmlFor="about-body"
            hint={t("store.storefront.aboutBodyHint")}
          >
            <textarea
              id="about-body"
              value={aboutBody}
              onChange={(e) => setAboutBody(e.target.value)}
              rows={8}
              maxLength={5000}
              placeholder={t("store.storefront.aboutBodyPlaceholder")}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
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

      {/* The "Made with Gwinn" credit. Its own card rather than a line in
          Branding, because it is the one thing on this page that is about the
          platform rather than the merchant — and because a Free store needs to
          see the switch exists (and what unlocks it) even though it can't use
          it yet. */}
      <SettingsCard
        title={t("store.storefront.creditTitle")}
        description={t("store.storefront.creditDescription")}
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            {t("store.storefront.saveChanges")}
          </PrimaryButton>
        }
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={!hidePlatformCredit}
            disabled={!canWhiteLabel}
            onChange={(e) => setHidePlatformCredit(!e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-sm">
            <span className="font-medium text-foreground">
              {t("store.storefront.creditToggle")}
            </span>
            <span className="mt-1 block text-muted-foreground">
              {t("store.storefront.creditToggleHint", { url: BRAND.url })}
            </span>
          </span>
        </label>
        {!canWhiteLabel && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("store.storefront.creditProOnly")}
          </p>
        )}
      </SettingsCard>
    </div>
  );
}
