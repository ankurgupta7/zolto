/**
 * "Bring your old shop with you" — the paid one-time switch-in.
 *
 * The card is laid out in the order of the promise it makes: read the site for
 * free, show the merchant everything that was found, and only then mention the
 * CHF 20. A price shown before the result would make this look like every other
 * platform's upsell; shown after, it's a quote for work already done.
 *
 * The three steps are the same three the server enforces (server/routers/
 * siteImport.ts): preview → checkout → apply. Nothing here can shortcut the
 * payment — `applyImport` refuses any row Stripe hasn't marked paid — so the
 * UI is free to be optimistic without being a security boundary.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Check,
  Download,
  Image as ImageIcon,
  Info,
  Palette,
  Store,
  Tags,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PrimaryButton, SecondaryButton, inputClass } from "./ui";
// Keep i18n initialised when this card is rendered in isolation (tests, the
// screenshot harness) before main.tsx has run.
import "@/lib/i18n";

/** The optional pieces, each opt-out because each overwrites existing work. */
type Extra = "categories" | "branding" | "profile";

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <div className="text-2xl font-semibold lining-nums tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ExtraToggle({
  icon: Icon,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof Tags;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
        disabled ? "opacity-50" : "cursor-pointer hover:border-primary"
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}

export default function SiteImportCard() {
  const { t } = useTranslation("admin");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<Extra, boolean>>({
    categories: true,
    branding: true,
    profile: true,
  });

  const status = trpc.siteImport.status.useQuery();
  const [returnedId, setReturnedId] = useState<number | null>(null);

  // Coming back from Stripe: ?imported=<id> on /admin/import. The id alone
  // proves nothing — the row is only importable if the webhook marked it paid,
  // which `get` reports and `applyImport` re-checks server-side.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returned = Number.parseInt(params.get("imported") ?? "", 10);
    if (Number.isFinite(returned) && returned > 0) setReturnedId(returned);
  }, []);

  const preview = trpc.siteImport.preview.useMutation({
    onSuccess: () => setError(null),
    onError: (e) => setError(e.message),
  });
  const stored = trpc.siteImport.get.useQuery(
    { importId: returnedId ?? 0 },
    { enabled: returnedId !== null && !preview.data },
  );
  // Derived, not mirrored into state: a fresh preview always wins over the id
  // we came back from Stripe with, and there is no order in which the two can
  // disagree about which import the Pay button is for.
  const importId = preview.data?.importId ?? returnedId ?? null;
  const checkout = trpc.siteImport.startCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (e) => setError(e.message),
  });
  const utils = trpc.useUtils();
  const applyImport = trpc.siteImport.applyImport.useMutation({
    onSuccess: () => {
      setError(null);
      void utils.siteImport.status.invalidate();
      void utils.products.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  // The price comes from the server (shared/platform.ts SITE_IMPORT), so the
  // admin card and the pricing page can never quote different numbers. The
  // prose does NOT: SITE_IMPORT is written in English for the marketing site,
  // and reading it here left a German merchant looking at an English card.
  const priceChf = status.data?.offer?.priceChf ?? 20;
  const result = preview.data ?? stored.data;
  const paid = stored.data?.status === "paid";
  const applied = applyImport.data ?? null;

  // The one button that finishes what the merchant already paid for. It is
  // rendered ABOVE the URL form when a payment has landed: at phone width the
  // form plus the counts plus the product list pushed it a full screen and a
  // half down, so a merchant returning from Stripe saw only the thing they had
  // already done and no way to finish.
  const applyAction = paid && !applied && (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-900">
        <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        {t("ops.siteImport.paidReady")}
      </p>
      <PrimaryButton
        loading={applyImport.isPending}
        onClick={() =>
          importId !== null && applyImport.mutate({ importId, ...extras })
        }
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {t("ops.siteImport.applyCta")}
      </PrimaryButton>
    </div>
  );

  return (
    <section className="mb-6 overflow-hidden rounded-xl border-2 border-primary/30 bg-card">
      <header className="border-b bg-muted/30 px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {t("ops.siteImport.title")}
          </h3>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium lining-nums text-primary">
            {t("ops.siteImport.priceBadge", { price: priceChf })}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("ops.siteImport.summary")}
        </p>
      </header>

      <div className="space-y-5 px-6 py-5">
        {applyAction}

        {/* Step 1 — the free read. */}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) preview.mutate({ url: url.trim() });
          }}
        >
          <input
            className={inputClass}
            type="url"
            inputMode="url"
            value={url}
            placeholder={t("ops.siteImport.urlPlaceholder")}
            aria-label={t("ops.siteImport.urlLabel")}
            onChange={(e) => setUrl(e.target.value)}
          />
          <PrimaryButton
            type="submit"
            loading={preview.isPending}
            disabled={!url.trim()}
            className="shrink-0"
          >
            {t("ops.siteImport.previewCta")}
          </PrimaryButton>
        </form>
        <p className="text-xs text-muted-foreground">
          {t("ops.siteImport.freeNote")}
        </p>

        {error && (
          <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        {/* Step 2 — what we found, before any mention of paying. */}
        {result && !applied && (
          <div className="space-y-4 border-t pt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                value={result.productCount}
                label={t("ops.siteImport.statProducts")}
              />
              <Stat
                value={result.pricedCount}
                label={t("ops.siteImport.statPriced")}
              />
              <Stat
                value={result.withPhoto}
                label={t("ops.siteImport.statPhotos")}
              />
              <Stat
                value={result.categories.length}
                label={t("ops.siteImport.statCategories")}
              />
            </div>

            {result.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {result.warnings.map((warning) => (
                  <li key={warning} className="flex gap-1.5">
                    <Info
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            {result.productCount > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border">
                <ul className="divide-y text-sm">
                  {result.products.slice(0, 50).map((product, i) => (
                    <li
                      key={`${product.name}-${i}`}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="truncate text-foreground">
                        {product.name}
                      </span>
                      <span className="shrink-0 text-xs lining-nums tabular-nums text-muted-foreground">
                        {product.price === null
                          ? t("ops.siteImport.noPrice")
                          : `${product.currency ?? "CHF"} ${product.price}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <ExtraToggle
                icon={Tags}
                label={t("ops.siteImport.extraCategories")}
                hint={t("ops.siteImport.extraCategoriesHint", {
                  count: result.categories.length,
                })}
                checked={extras.categories}
                disabled={!result.has.categories}
                onChange={(next) =>
                  setExtras((prev) => ({ ...prev, categories: next }))
                }
              />
              <ExtraToggle
                icon={Palette}
                label={t("ops.siteImport.extraBranding")}
                hint={
                  result.has.logo || result.has.brandColour
                    ? t("ops.siteImport.extraBrandingFound")
                    : t("ops.siteImport.extraNothingFound")
                }
                checked={extras.branding}
                disabled={!result.has.logo && !result.has.brandColour}
                onChange={(next) =>
                  setExtras((prev) => ({ ...prev, branding: next }))
                }
              />
              <ExtraToggle
                icon={Store}
                label={t("ops.siteImport.extraProfile")}
                hint={
                  result.has.shopProfile
                    ? t("ops.siteImport.extraProfileFound")
                    : t("ops.siteImport.extraNothingFound")
                }
                checked={extras.profile}
                disabled={!result.has.shopProfile}
                onChange={(next) =>
                  setExtras((prev) => ({ ...prev, profile: next }))
                }
              />
            </div>

            {/* Step 3 — the ask, and why it costs anything at all. Unmounted
                once paid (not merely hidden): the action already sits at the
                top of the card, and a second copy would be two buttons for one
                job — including for a screen reader walking the card. */}
            {!paid && (
              <div className="rounded-lg border bg-muted/30 px-4 py-4">
                {result.productCount === 0 && !result.has.shopProfile ? (
                  <p className="text-sm text-muted-foreground">
                    {t("ops.siteImport.nothingToCharge")}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-md text-xs text-muted-foreground">
                      {t("ops.siteImport.whyPaid")}
                    </p>
                    <PrimaryButton
                      loading={checkout.isPending}
                      disabled={
                        !status.data?.checkoutAvailable || importId === null
                      }
                      onClick={() =>
                        importId !== null && checkout.mutate({ importId })
                      }
                    >
                      {t("ops.siteImport.payCta", { price: priceChf })}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </PrimaryButton>
                  </div>
                )}
                {!status.data?.checkoutAvailable && result.productCount > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("ops.siteImport.checkoutUnavailable")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Done. */}
        {applied && (
          <div className="space-y-2 border-t pt-5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              {t("ops.siteImport.doneTitle", {
                created: applied.productsCreated,
                updated: applied.productsUpdated,
              })}
            </p>
            {applied.hiddenPending > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ImageIcon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                {t("ops.siteImport.doneHidden", {
                  count: applied.hiddenPending,
                })}
              </p>
            )}
            {applied.productsFailed.length > 0 && (
              <p className="text-xs text-amber-800">
                {t("ops.siteImport.doneFailed", {
                  names: applied.productsFailed.slice(0, 5).join(", "),
                })}
              </p>
            )}
            <SecondaryButton
              onClick={() => {
                setReturnedId(null);
                preview.reset();
                applyImport.reset();
                setUrl("");
              }}
            >
              {t("ops.siteImport.doneAgain")}
            </SecondaryButton>
          </div>
        )}
      </div>
    </section>
  );
}
