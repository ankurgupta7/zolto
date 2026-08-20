import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { derivePalette } from "@/lib/palette";
import {
  STORE_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  type TemplateId,
} from "@shared/templates";
import { slugify, isValidSlug } from "../slug";
import { Container } from "../components/Container";
import { VERTICALS, VERTICAL_PRESETS, type Vertical } from "@shared/verticals";
import {
  MIGRATE_FROM_LABELS,
  MIGRATE_FROM_PROVIDERS,
  type MigrateFromProvider,
} from "@shared/const";
import { useMarketingT } from "../lib/marketingI18n";
import type { SupportedLanguage } from "@/lib/languages";

/**
 * Signup wizard: details → look.
 *
 * The "look" step settles logo, color, and template TOGETHER, on one screen,
 * because those three decisions inform each other and can't be ordered: the
 * logo's colors drive the palette, and the palette suggests a template.
 * Splitting them made the merchant's choice appear to mutate on the next
 * screen (pick Verdant's green, then watch the AI replace it with the logo's
 * terracotta) and forced an awkward "switch template?" prompt after the fact.
 *
 * The halves compose rather than override — a template owns the SURFACE
 * variables (grounds, borders, muted text) and `primary_color` owns the
 * ink/accent family via derivePalette — so the template cards render in the
 * merchant's live color and differ only in the surfaces that are actually
 * theirs to choose. A template's `defaultPrimaryColor` is only ever a SEED,
 * applied while the merchant has neither uploaded a logo nor picked a color.
 *
 * Everything here rides along on tenant.create, so a merchant who bails after
 * the details step never half-brands a store.
 */

const STEPS = ["details", "look"] as const;

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/**
 * The vertical labels already exist in four languages in shared/verticals.ts,
 * so they are read from there rather than duplicated into the locale files —
 * the same shape client/src/hooks/useCategories.ts uses for category labels.
 */
function verticalLabel(v: Vertical, lang: SupportedLanguage): string {
  const preset = VERTICAL_PRESETS[v];
  const localized =
    lang === "de"
      ? preset.labelDe
      : lang === "fr"
        ? preset.labelFr
        : lang === "it"
          ? preset.labelIt
          : preset.labelEn;
  return localized || preset.labelEn;
}

const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type LogoMime = (typeof LOGO_MIME_TYPES)[number];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface LogoDraft {
  dataUrl: string;
  mimeType: LogoMime;
  fileName: string;
}

export default function Signup() {
  const { t, st, lang } = useMarketingT();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);

  // Step 1 — details.
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  // What the store sells — seeds its category list (shared/verticals.ts) and
  // tunes the AI tools. Part of "details": it's identity, not looks.
  const [vertical, setVertical] = useState<Vertical>("other");
  const [verticalDescription, setVerticalDescription] = useState("");
  // Where they sell today, if anywhere. Empty = starting fresh. Rides along on
  // tenant.create and aims the onboarding checklist's catalogue step at the
  // matching importer (server/onboarding.ts) instead of "add your first
  // product" — a switching merchant should never re-type what they've already
  // keyed into Stripe/SumUp/Worldline.
  const [migrateFrom, setMigrateFrom] = useState<MigrateFromProvider | "">("");

  // Auto-derive slug from the store name until the user edits the slug directly.
  const effectiveSlug = slugTouched ? slug : slugify(name);

  // Step 2 — template.
  const [templateId, setTemplateId] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);

  // Step 3 — branding. The color follows the chosen template's default until
  // the merchant picks their own (manually or via the AI extraction).
  const [colorTouched, setColorTouched] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(
    getTemplate(DEFAULT_TEMPLATE_ID)?.defaultPrimaryColor ?? "#2D2620",
  );
  const [secondaryColor, setSecondaryColor] = useState(
    getTemplate(DEFAULT_TEMPLATE_ID)?.defaultSecondaryColor ?? "#B8963E",
  );
  const [logo, setLogo] = useState<LogoDraft | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiTemplateId, setAiTemplateId] = useState<TemplateId | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectTemplate = (id: TemplateId) => {
    setTemplateId(id);
    if (!colorTouched) {
      const tpl = getTemplate(id);
      if (tpl) {
        setPrimaryColor(tpl.defaultPrimaryColor);
        setSecondaryColor(tpl.defaultSecondaryColor);
      }
    }
  };

  const brandingFromLogo = trpc.tenant.brandingFromLogo.useMutation({
    onSuccess: (data) => {
      setPrimaryColor(data.primaryColor);
      // A logo with only one usable color leaves the highlight alone rather
      // than echoing the primary, which would render an invisible accent.
      if (data.secondaryColor) setSecondaryColor(data.secondaryColor);
      setColorTouched(true);
      setAiNote(data.rationale);
      const suggested = data.suggestedTemplateId as TemplateId | null;
      setAiTemplateId(suggested);
      // Everything is on one screen, so the suggestion is applied and marked
      // rather than offered as a separate "switch?" prompt — the merchant sees
      // the card highlight and the preview change in the same glance, and can
      // click any other card to overrule it.
      if (suggested) setTemplateId(suggested);
    },
    onError: (err) => {
      toast.error(err.message || t("signup.toastLogoColorsFailed"));
    },
  });

  const createTenant = trpc.tenant.create.useMutation({
    onSuccess: (data) => {
      // Auth is via the identity provider: stash the one-time claim token so the
      // owner can take ownership (tenant.claimAdmin) once they've signed in.
      try {
        sessionStorage.setItem("gwinn_claim_token", data.claimToken);
      } catch {
        /* private-mode / storage disabled — claim can still be re-issued */
      }
      if (logo && !data.logoUrl) {
        toast.warning(t("signup.toastLogoNotUploaded"));
      } else {
        // Mention the emailed setup link only when it actually went out
        // (claimEmailSent is false on deployments without mail configured).
        toast.success(
          data.claimEmailSent
            ? t("signup.toastCreatedWithEmail")
            : t("signup.toastCreated"),
        );
      }
      navigate(`/onboarding?store=${encodeURIComponent(data.slug)}`);
    },
    onError: (err) => {
      const message = err.message || t("signup.toastGenericError");
      // An email that's already attached — or mid-signup with an unclaimed
      // store — is recoverable by signing in; hand over the door, not just
      // the wall. (The slug-taken CONFLICT names no email and stays plain.)
      if (err.data?.code === "CONFLICT" && /email/i.test(message)) {
        toast.error(message, {
          action: {
            label: t("signup.toastSignInAction"),
            onClick: () => navigate("/signin"),
          },
        });
      } else {
        toast.error(message);
      }
    },
  });

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 1) e.name = t("signup.errorName");
    if (!isValidSlug(effectiveSlug)) e.slug = t("signup.errorSlug");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      e.email = t("signup.errorEmail");
    return e;
  }, [name, effectiveSlug, email, t]);

  const detailsValid = Object.keys(errors).length === 0;
  const colorValid = HEX6.test(primaryColor);
  const secondaryValid = HEX6.test(secondaryColor);
  const canSubmit =
    detailsValid && colorValid && secondaryValid && !createTenant.isPending;

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error(t("signup.toastLogoType"));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("signup.toastLogoSize"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogo({
        dataUrl: String(reader.result),
        mimeType: file.type as LogoMime,
        fileName: file.name,
      });
      setAiNote(null);
      setAiTemplateId(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    // Enter in a step-1/2 field advances the wizard; only step 3 creates.
    if (step === 0) {
      if (detailsValid) setStep(1);
      return;
    }
    if (!canSubmit) return;
    createTenant.mutate({
      name: name.trim(),
      slug: effectiveSlug,
      email: email.trim(),
      vertical,
      verticalDescription: verticalDescription.trim() || undefined,
      migrateFrom: migrateFrom || undefined,
      templateId,
      primaryColor,
      secondaryColor,
      logo: logo
        ? { imageData: logo.dataUrl, mimeType: logo.mimeType }
        : undefined,
    });
  };

  const template = getTemplate(templateId) ?? STORE_TEMPLATES[0];
  const previewPalette = derivePalette(primaryColor, secondaryColor);
  // The merchant's own color, resolved to the ink the storefront would render.
  // Falls back per-card while the hex field is mid-edit and unparseable.
  const previewInk = previewPalette?.["--brand-ink"] ?? null;
  const previewAccent = previewPalette?.["--brand-accent"] ?? null;

  return (
    <Container width="2xl" className="py-20">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {t("signup.eyebrow")}
      </p>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
        {t("signup.heading")}
      </h1>
      <p className="mt-2 text-sm text-[var(--brand-muted-2)]">
        {t("signup.subheading")}
      </p>

      {/* Step indicator */}
      <ol className="mt-8 flex gap-2" aria-label={t("signup.stepsLabel")}>
        {STEPS.map((stepKey, i) => (
          <li
            key={stepKey}
            aria-current={i === step ? "step" : undefined}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.1em] ${
              i === step
                ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                : i < step
                  ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                  : "border-[var(--brand-border-2)] text-[var(--brand-muted)]"
            }`}
          >
            <span>{i + 1}</span>
            <span className="hidden sm:inline">
              {t(`signup.steps.${stepKey}`)}
            </span>
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit} className="mt-10" noValidate>
        {step === 0 && (
          <div className="max-w-md space-y-5">
            <Field
              label={t("signup.storeNameLabel")}
              error={name ? errors.name : undefined}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("signup.storeNamePlaceholder")}
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label={t("signup.storeUrlLabel")}
              error={slugTouched && slug ? errors.slug : undefined}
              hint={
                effectiveSlug
                  ? `${effectiveSlug}.gwinn.ch`
                  : t("signup.storeUrlHint")
              }
            >
              <input
                type="text"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder={t("signup.storeUrlPlaceholder")}
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label={t("signup.emailLabel")}
              error={email ? errors.email : undefined}
              hint={t("signup.emailHint")}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("signup.emailPlaceholder")}
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label={t("signup.verticalLabel")}
              hint={t("signup.verticalHint")}
            >
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value as Vertical)}
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              >
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>
                    {verticalLabel(v, lang)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("signup.rangeLabel")} hint={t("signup.rangeHint")}>
              <input
                type="text"
                value={verticalDescription}
                onChange={(e) => setVerticalDescription(e.target.value)}
                maxLength={500}
                placeholder={t("signup.rangePlaceholder")}
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label={t("signup.migrateLabel")}
              hint={t("signup.migrateHint")}
            >
              <select
                value={migrateFrom}
                onChange={(e) =>
                  setMigrateFrom(e.target.value as MigrateFromProvider | "")
                }
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              >
                <option value="">{t("signup.migrateNone")}</option>
                {MIGRATE_FROM_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "other"
                      ? t("signup.migrateOther")
                      : t("signup.migrateYes", {
                          provider: MIGRATE_FROM_LABELS[p],
                        })}
                  </option>
                ))}
              </select>
            </Field>

            {migrateFrom && migrateFrom !== "other" && (
              <p className="rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/8 p-4 text-sm text-[var(--brand-text)]">
                {migrateFrom === "stripe"
                  ? t("signup.migrateStripeNote")
                  : t("signup.migrateCsvNote", {
                      provider: MIGRATE_FROM_LABELS[migrateFrom],
                    })}
              </p>
            )}

            <button
              type="button"
              disabled={!detailsValid}
              onClick={() => setStep(1)}
              className="w-full rounded-md bg-[var(--brand-ink)] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("signup.chooseLook")}
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
              {/* Brand inputs: the logo first, because everything else can be
                  derived from it. */}
              <div className="max-w-md space-y-6">
                <div>
                  <h2 className="font-serif text-xl text-[var(--brand-text)]">
                    {t("signup.brandingHeading")}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
                    {t("signup.brandingIntro")}
                  </p>
                </div>

                <Field
                  label={t("signup.logoLabel")}
                  hint={t("signup.logoHint")}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={LOGO_MIME_TYPES.join(",")}
                    onChange={(e) => handleLogoFile(e.target.files?.[0])}
                    className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-sm text-[var(--brand-text)] file:mr-3 file:rounded file:border-0 file:bg-[var(--brand-surface)] file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.1em]"
                  />
                </Field>

                {logo && (
                  <div className="space-y-3 rounded-xl border border-[var(--brand-border)] bg-white p-4">
                    <div className="flex items-center gap-4">
                      <img
                        src={logo.dataUrl}
                        alt={t("signup.logoAlt")}
                        className="h-14 w-14 rounded-md border border-[var(--brand-border)] object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--brand-text)]">
                          {logo.fileName}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setLogo(null);
                            setAiNote(null);
                            setAiTemplateId(null);
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                          className="mt-0.5 text-xs text-[var(--brand-muted)] underline hover:text-[var(--brand-text)]"
                        >
                          {t("signup.logoRemove")}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={brandingFromLogo.isPending}
                      onClick={() =>
                        brandingFromLogo.mutate({ imageData: logo.dataUrl })
                      }
                      className="w-full rounded-md border border-[var(--brand-accent)] px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--brand-accent)] transition-colors hover:bg-[var(--brand-accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {brandingFromLogo.isPending
                        ? t("signup.logoReading")
                        : t("signup.logoColors")}
                    </button>
                  </div>
                )}

                {aiNote && (
                  <p className="rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/8 p-4 text-sm text-[var(--brand-text)]">
                    {aiNote}
                  </p>
                )}

                {/* The two colors the whole storefront is built from. Always
                    visible and always editable, whether the merchant typed
                    them or the AI read them off the logo — so an extracted
                    scheme is a starting point, never a black box. */}
                <div className="space-y-4">
                  <ColorField
                    label={t("signup.primaryColor")}
                    hexLabel={t("signup.primaryColorHex")}
                    hint={t("signup.primaryColorHint")}
                    error={t("signup.errorColor")}
                    value={primaryColor}
                    fallback={template.defaultPrimaryColor}
                    onChange={(v) => {
                      setPrimaryColor(v);
                      setColorTouched(true);
                    }}
                  />
                  <ColorField
                    label={t("signup.secondaryColor")}
                    hexLabel={t("signup.secondaryColorHex")}
                    hint={t("signup.secondaryColorHint")}
                    error={t("signup.errorColor")}
                    value={secondaryColor}
                    fallback={template.defaultSecondaryColor}
                    onChange={(v) => {
                      setSecondaryColor(v);
                      setColorTouched(true);
                    }}
                  />
                </div>
              </div>

              {/* Live preview: chosen template surfaces + ink derived from the color */}
              <aside aria-label={t("signup.previewAria")}>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-muted)]">
                  {t("signup.previewLabel")}
                </p>
                <div
                  className="mt-2 overflow-hidden rounded-xl border"
                  style={{ borderColor: template.cssVars["--brand-border"] }}
                >
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    style={{
                      backgroundColor:
                        previewInk ?? template.defaultPrimaryColor,
                    }}
                  >
                    {logo ? (
                      <img
                        src={logo.dataUrl}
                        alt=""
                        className="h-6 w-6 rounded-sm bg-white/90 object-contain p-0.5"
                      />
                    ) : (
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: previewAccent ?? "#b8963e" }}
                      />
                    )}
                    <span className="truncate font-serif text-sm text-white">
                      {name.trim() || t("signup.previewStoreName")}
                    </span>
                  </div>
                  <div
                    className="space-y-3 p-4"
                    style={{
                      backgroundColor: template.cssVars["--brand-ground"],
                    }}
                  >
                    <div
                      className="h-2 w-24 rounded-full"
                      style={{ backgroundColor: previewAccent ?? "#b8963e" }}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-16 rounded-md"
                          style={{
                            backgroundColor:
                              template.cssVars["--brand-surface"],
                          }}
                        />
                      ))}
                    </div>
                    <div
                      className="inline-block rounded px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-white"
                      style={{
                        backgroundColor:
                          previewInk ?? template.defaultPrimaryColor,
                      }}
                    >
                      {t("signup.previewAddToCart")}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--brand-muted)]">
                  {t("signup.previewMeta", {
                    template: template.name,
                    color: primaryColor,
                    secondary: secondaryColor,
                  })}
                </p>
              </aside>
            </div>

            {/* Templates last: they only change the surfaces around the color
                above, so every card renders in the merchant's own color. */}
            <div className="mt-12">
              <h2 className="font-serif text-xl text-[var(--brand-text)]">
                {t("signup.templateHeading")}
              </h2>
              <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
                {t("signup.templateIntro")}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {STORE_TEMPLATES.map((tpl) => {
                  const selected = tpl.id === templateId;
                  // A card previews the merchant's live color on that
                  // template's surfaces — the templates differ in the
                  // surfaces, never in the brand color.
                  const cardInk = previewInk ?? tpl.defaultPrimaryColor;
                  const cardAccent = previewAccent ?? tpl.defaultSecondaryColor;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectTemplate(tpl.id)}
                      className={`rounded-xl border p-4 text-left transition-shadow ${
                        selected
                          ? "border-[var(--brand-accent)] shadow-md ring-1 ring-[var(--brand-accent)]"
                          : "border-[var(--brand-border)] hover:shadow-sm"
                      }`}
                      style={{
                        backgroundColor: tpl.cssVars["--brand-surface-2"],
                      }}
                    >
                      {/* Mini storefront: the live ink over template surfaces */}
                      <div
                        className="overflow-hidden rounded-md border"
                        style={{ borderColor: tpl.cssVars["--brand-border"] }}
                      >
                        <div
                          className="h-6"
                          style={{ backgroundColor: cardInk }}
                        />
                        <div
                          className="space-y-1.5 p-2"
                          style={{
                            backgroundColor: tpl.cssVars["--brand-ground"],
                          }}
                        >
                          {/* Both brand colors on every card: the ink band
                              above, the highlight here. */}
                          <div
                            className="h-1 w-10 rounded-full"
                            style={{ backgroundColor: cardAccent }}
                          />
                          <div className="flex gap-1.5">
                            {[0, 1, 2].map((i) => (
                              <div
                                key={i}
                                className="h-8 flex-1 rounded-sm"
                                style={{
                                  backgroundColor:
                                    tpl.cssVars["--brand-surface"],
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 flex items-center justify-between font-serif text-lg text-[var(--brand-text)]">
                        {tpl.name}
                        {selected && (
                          <span className="font-sans text-xs uppercase tracking-[0.1em] text-[var(--brand-accent)]">
                            {t("signup.templateSelected")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--brand-muted-2)]">
                        {st(`templates.${tpl.id}.tagline`, tpl.tagline)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--brand-muted)]">
                        {st(`templates.${tpl.id}.bestFor`, tpl.bestFor)}
                      </p>
                      {aiTemplateId === tpl.id && (
                        <p className="mt-2 text-xs text-[var(--brand-accent)]">
                          {t("signup.templateFromLogo")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-10 max-w-md">
              <div className="flex gap-3">
                <BackButton onClick={() => setStep(0)} />
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 whitespace-nowrap rounded-md bg-[var(--brand-ink)] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createTenant.isPending
                    ? t("signup.creating")
                    : t("signup.createStore")}
                </button>
              </div>

              <p className="mt-5 text-center text-xs text-[var(--brand-muted)]">
                {t("signup.termsLead")}{" "}
                <a
                  href="/legal/terms"
                  className="text-[var(--brand-accent)] hover:underline"
                >
                  {t("signup.termsLink")}
                </a>{" "}
                {t("signup.termsAnd")}{" "}
                <a
                  href="/legal/privacy"
                  className="text-[var(--brand-accent)] hover:underline"
                >
                  {t("signup.privacyLink")}
                </a>
                .
              </p>
            </div>
          </div>
        )}
      </form>
    </Container>
  );
}

/**
 * One brand color: a swatch, an editable hex, and the role it plays. The native
 * picker needs a valid hex or it silently shows black, so it falls back to the
 * template's seed while the text field is mid-edit — the text field itself
 * keeps whatever was typed, and the error surfaces below.
 */
function ColorField({
  label,
  hexLabel,
  hint,
  error,
  value,
  fallback,
  onChange,
}: {
  label: string;
  hexLabel: string;
  hint: string;
  error: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const valid = HEX6.test(value);
  return (
    <Field label={label} error={valid ? undefined : error} hint={hint}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={label}
          value={valid ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 cursor-pointer rounded-md border border-[var(--brand-border-2)] bg-white p-1"
        />
        <input
          type="text"
          aria-label={hexLabel}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          className="w-32 rounded-md border border-[var(--brand-border-2)] bg-white px-3 py-2.5 font-mono text-sm text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
        />
      </div>
    </Field>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useMarketingT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap rounded-md border border-[var(--brand-ink)]/25 px-5 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
    >
      {t("signup.back")}
    </button>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the associated control is supplied via {children} and can't be seen statically
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--brand-text)]">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-[var(--brand-muted)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
