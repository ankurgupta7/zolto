/**
 * Shop profile (account plane) — the store's identity within Zolto: name, slug,
 * plan/trial status, business contact details, and the currency it sells in.
 * Name and slug are the tenant's stable identity (changing them is a support
 * operation), so they're shown read-only; the rest is editable via
 * tenant.updateSettings.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  Field,
  inputClass,
  PrimaryButton,
  AdminOnly,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";
import { DEFAULT_CURRENCY, formatPrice } from "@/lib/money";
import { VERTICALS, VERTICAL_PRESETS, isVertical } from "@shared/verticals";

/**
 * The currencies a Swiss-first marketplace plausibly sells in. The server
 * accepts any 3-letter code (tenant.updateSettings), so this list is a
 * convenience, not a constraint — it exists because a free-text box invites
 * typos into every price on the storefront. Labels live in the admin locale
 * fragments (store.shopProfile.currencies.*).
 */
const CURRENCY_CODES = ["chf", "eur", "usd", "gbp"] as const;

export default function ShopProfile() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const { tenant, settings, invalidate } = useTenantSettings();
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [vertical, setVertical] = useState<string>("jewellery");
  const [verticalDescription, setVerticalDescription] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) {
      setContactEmail(settings.contactEmail ?? "");
      setContactPhone(settings.contactPhone ?? "");
      setCurrency((settings.currency || DEFAULT_CURRENCY).toLowerCase());
      setVertical(
        settings.vertical && isVertical(settings.vertical)
          ? settings.vertical
          : "jewellery",
      );
      setVerticalDescription(settings.verticalDescription ?? "");
    }
  }, [settings]);

  const save = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("store.shopProfile.savedToast"));
    },
    onError: (e) => toast.error(e.message || t("store.shopProfile.saveError")),
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const storeUrl = tenant?.slug ? `${tenant.slug}.zolto.ch` : null;

  const onSave = () => {
    if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      toast.error(t("store.shopProfile.invalidEmail"));
      return;
    }
    save.mutate({
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      currency,
      ...(isVertical(vertical) ? { vertical } : {}),
      verticalDescription: verticalDescription.trim() || null,
    });
  };

  const savedCurrency = (settings?.currency || DEFAULT_CURRENCY).toLowerCase();

  return (
    <div>
      <PageHeader
        title={t("store.shopProfile.title")}
        description={t("store.shopProfile.description")}
      />

      <SettingsCard title={t("store.shopProfile.identityTitle")}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("store.shopProfile.storeName")}
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {tenant?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("store.shopProfile.storeAddress")}
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
              {storeUrl ? (
                <>
                  <span>{storeUrl}</span>
                  <button
                    type="button"
                    aria-label={t("store.shopProfile.copyAddressAria")}
                    onClick={() => {
                      navigator.clipboard?.writeText(`https://${storeUrl}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("store.shopProfile.plan")}
            </dt>
            <dd className="mt-1 text-sm capitalize text-foreground">
              {tenant?.plan ?? "free"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("store.shopProfile.status")}
            </dt>
            <dd className="mt-1 text-sm capitalize text-foreground">
              {tenant?.subscriptionStatus ?? "trialing"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          {t("store.shopProfile.renameNote")}
        </p>
      </SettingsCard>

      <SettingsCard
        title={t("store.shopProfile.contactTitle")}
        description={t("store.shopProfile.contactDescription")}
        footer={
          <PrimaryButton onClick={onSave} loading={save.isPending}>
            {t("store.shopProfile.saveChanges")}
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label={t("store.shopProfile.contactEmail")}
            htmlFor="contact-email"
          >
            <input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="hello@yourstore.example"
              className={inputClass}
            />
          </Field>
          <Field
            label={t("store.shopProfile.contactPhone")}
            htmlFor="contact-phone"
          >
            <input
              id="contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+41 79 000 00 00"
              className={inputClass}
            />
          </Field>

          <Field
            label={t("store.shopProfile.currency")}
            htmlFor="currency"
            hint={t("store.shopProfile.currencyHint")}
          >
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()} —{" "}
                  {t(`store.shopProfile.currencies.${code}`)}
                </option>
              ))}
              {/* A code set outside this list (by support, or before this
                  selector existed) must not silently reset to CHF on save. */}
              {!CURRENCY_CODES.some((code) => code === currency) && (
                <option value={currency}>{currency.toUpperCase()}</option>
              )}
            </select>
          </Field>

          <Field
            label={t("store.shopProfile.verticalLabel")}
            htmlFor="vertical"
            hint={t("store.shopProfile.verticalHint")}
          >
            <select
              id="vertical"
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className={inputClass}
            >
              {VERTICALS.map((v) => (
                <option key={v} value={v}>
                  {VERTICAL_PRESETS[v].labelEn}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={t("store.shopProfile.rangeLabel")}
            htmlFor="vertical-description"
            hint={t("store.shopProfile.rangeHint")}
          >
            <textarea
              id="vertical-description"
              value={verticalDescription}
              onChange={(e) => setVerticalDescription(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t("store.shopProfile.rangePlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              {t("store.shopProfile.currencyNote")}
              {currency !== savedCurrency ? (
                <>
                  {" "}
                  {t("store.shopProfile.currencyChangeNote", {
                    old: formatPrice(50, savedCurrency),
                    new: formatPrice(50, currency),
                  })}
                </>
              ) : null}
            </p>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
