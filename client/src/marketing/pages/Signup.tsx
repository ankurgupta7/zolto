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

/**
 * Signup wizard: details → template → branding.
 *
 * Step 2 picks one of the five storefront templates (shared/templates.ts);
 * step 3 settles the color scheme — manually, or extracted from an uploaded
 * logo by AI (tenant.brandingFromLogo) — and the logo itself, which becomes
 * the store's navbar/footer branding the moment the store exists. Everything
 * from steps 2–3 rides along on tenant.create, so a merchant who bails after
 * step 1's fields never half-brands a store.
 */

const STEPS = ["Store details", "Template", "Branding"] as const;

const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type LogoMime = (typeof LOGO_MIME_TYPES)[number];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface LogoDraft {
  dataUrl: string;
  mimeType: LogoMime;
  fileName: string;
}

export default function Signup() {
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
  const [logo, setLogo] = useState<LogoDraft | null>(null);
  const [aiNote, setAiNote] = useState<{
    rationale: string | null;
    suggestedTemplateId: TemplateId | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectTemplate = (id: TemplateId) => {
    setTemplateId(id);
    if (!colorTouched) {
      const t = getTemplate(id);
      if (t) setPrimaryColor(t.defaultPrimaryColor);
    }
  };

  const brandingFromLogo = trpc.tenant.brandingFromLogo.useMutation({
    onSuccess: (data) => {
      setPrimaryColor(data.primaryColor);
      setColorTouched(true);
      setAiNote({
        rationale: data.rationale,
        suggestedTemplateId: data.suggestedTemplateId as TemplateId | null,
      });
    },
    onError: (err) => {
      toast.error(err.message || "Couldn't read colors from that logo.");
    },
  });

  const createTenant = trpc.tenant.create.useMutation({
    onSuccess: (data) => {
      // Auth is via the identity provider: stash the one-time claim token so the
      // owner can take ownership (tenant.claimAdmin) once they've signed in.
      try {
        sessionStorage.setItem("zolto_claim_token", data.claimToken);
      } catch {
        /* private-mode / storage disabled — claim can still be re-issued */
      }
      if (logo && !data.logoUrl) {
        toast.warning(
          "Your store is ready, but the logo didn't upload — add it again from your admin.",
        );
      } else {
        // Mention the emailed setup link only when it actually went out
        // (claimEmailSent is false on deployments without mail configured).
        toast.success(
          data.claimEmailSent
            ? "Store created — we've also emailed you a setup link, in case you need it later."
            : "Store created — let's set it up.",
        );
      }
      navigate(`/onboarding?store=${encodeURIComponent(data.slug)}`);
    },
    onError: (err) => {
      const message = err.message || "Something went wrong. Please try again.";
      // An email that's already attached — or mid-signup with an unclaimed
      // store — is recoverable by signing in; hand over the door, not just
      // the wall. (The slug-taken CONFLICT names no email and stays plain.)
      if (err.data?.code === "CONFLICT" && /email/i.test(message)) {
        toast.error(message, {
          action: { label: "Sign in", onClick: () => navigate("/signin") },
        });
      } else {
        toast.error(message);
      }
    },
  });

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 1) e.name = "Store name is required.";
    if (!isValidSlug(effectiveSlug))
      e.slug = "Use 3–64 lowercase letters, numbers, or hyphens.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      e.email = "Enter a valid email.";
    return e;
  }, [name, effectiveSlug, email]);

  const detailsValid = Object.keys(errors).length === 0;
  const colorValid = /^#[0-9A-Fa-f]{6}$/.test(primaryColor);
  const canSubmit = detailsValid && colorValid && !createTenant.isPending;

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 2 MB.");
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
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    // Enter in a step-1/2 field advances the wizard; only step 3 creates.
    if (step < 2) {
      if (detailsValid) setStep(step + 1);
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
      logo: logo
        ? { imageData: logo.dataUrl, mimeType: logo.mimeType }
        : undefined,
    });
  };

  const template = getTemplate(templateId) ?? STORE_TEMPLATES[0];
  const previewPalette = derivePalette(primaryColor);

  return (
    <Container width="2xl" className="py-20">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        let&rsquo;s begin
      </p>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
        Create your store
      </h1>
      <p className="mt-2 text-sm text-[var(--brand-muted-2)]">
        Free to start. 14-day trial on paid features. No card required.
      </p>

      {/* Step indicator */}
      <ol className="mt-8 flex gap-2" aria-label="Signup steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
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
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit} className="mt-10" noValidate>
        {step === 0 && (
          <div className="max-w-md space-y-5">
            <Field label="Store name" error={name ? errors.name : undefined}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your store name"
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label="Store URL"
              error={slugTouched && slug ? errors.slug : undefined}
              hint={
                effectiveSlug
                  ? `${effectiveSlug}.zolto.ch`
                  : "yourstore.zolto.ch"
              }
            >
              <input
                type="text"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="yourstore"
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label="Email"
              error={email ? errors.email : undefined}
              hint="You'll finish setup by signing in with this email."
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label="What do you sell?"
              hint="Sets up your starting categories and tunes the AI tools to your kind of store. You can change it later."
            >
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value as Vertical)}
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              >
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>
                    {VERTICAL_PRESETS[v].labelEn}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Describe your range (optional)"
              hint="One sentence in your own words — the AI uses it to write better listings."
            >
              <input
                type="text"
                value={verticalDescription}
                onChange={(e) => setVerticalDescription(e.target.value)}
                maxLength={500}
                placeholder="e.g. Wheel-thrown stoneware tableware in muted glazes"
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              />
            </Field>

            <Field
              label="Already selling somewhere?"
              hint="We'll set up your first step to bring that catalogue across instead of re-typing it."
            >
              <select
                value={migrateFrom}
                onChange={(e) =>
                  setMigrateFrom(e.target.value as MigrateFromProvider | "")
                }
                className="w-full rounded-md border border-[var(--brand-border-2)] bg-white px-4 py-2.5 text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
              >
                <option value="">No — starting fresh</option>
                {MIGRATE_FROM_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "other"
                      ? "Somewhere else"
                      : `Yes — ${MIGRATE_FROM_LABELS[p]}`}
                  </option>
                ))}
              </select>
            </Field>

            {migrateFrom && migrateFrom !== "other" && (
              <p className="rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/8 p-4 text-sm text-[var(--brand-text)]">
                {migrateFrom === "stripe"
                  ? "Good news — link the Stripe account you already have and your products import in one click. Your checkout keeps working throughout."
                  : `Export your items as CSV from ${MIGRATE_FROM_LABELS[migrateFrom]} and we'll read it for you — Swiss price formats and German or French column names included.`}
              </p>
            )}

            <button
              type="button"
              disabled={!detailsValid}
              onClick={() => setStep(1)}
              className="w-full rounded-md bg-[var(--brand-ink)] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Choose your look →
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="font-serif text-xl text-[var(--brand-text)]">
              Pick a template
            </h2>
            <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
              Five looks made for small shops. You can change it any time — and
              your own colors come next.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STORE_TEMPLATES.map((t) => {
                const selected = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectTemplate(t.id)}
                    className={`rounded-xl border p-4 text-left transition-shadow ${
                      selected
                        ? "border-[var(--brand-accent)] shadow-md ring-1 ring-[var(--brand-accent)]"
                        : "border-[var(--brand-border)] hover:shadow-sm"
                    }`}
                    style={{ backgroundColor: t.cssVars["--brand-surface-2"] }}
                  >
                    {/* Mini storefront: ink header band over template surfaces */}
                    <div
                      className="overflow-hidden rounded-md border"
                      style={{ borderColor: t.cssVars["--brand-border"] }}
                    >
                      <div
                        className="h-6"
                        style={{ backgroundColor: t.defaultPrimaryColor }}
                      />
                      <div
                        className="flex gap-1.5 p-2"
                        style={{ backgroundColor: t.cssVars["--brand-ground"] }}
                      >
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="h-8 flex-1 rounded-sm"
                            style={{
                              backgroundColor: t.cssVars["--brand-surface"],
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="mt-3 flex items-center justify-between font-serif text-lg text-[var(--brand-text)]">
                      {t.name}
                      {selected && (
                        <span className="text-xs font-sans uppercase tracking-[0.1em] text-[var(--brand-accent)]">
                          Selected
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--brand-muted-2)]">
                      {t.tagline}
                    </p>
                    <p className="mt-1 text-xs text-[var(--brand-muted)]">
                      {t.bestFor}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex gap-3">
              <BackButton onClick={() => setStep(0)} />
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md bg-[var(--brand-ink)] px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)]"
              >
                Choose your colors →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="max-w-md space-y-6">
              <div>
                <h2 className="font-serif text-xl text-[var(--brand-text)]">
                  Your logo &amp; colors
                </h2>
                <p className="mt-1 text-sm text-[var(--brand-muted-2)]">
                  Upload your logo and we&rsquo;ll brand your store with it —
                  and, if you like, let AI pick your color scheme from it.
                </p>
              </div>

              <Field
                label="Logo (optional)"
                hint="PNG, JPEG, or WebP, up to 2 MB. Shown in your store's navbar and footer."
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
                      alt="Your logo"
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
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
                        }}
                        className="mt-0.5 text-xs text-[var(--brand-muted)] underline hover:text-[var(--brand-text)]"
                      >
                        Remove
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
                      ? "Reading…"
                      : "✨ Colors from logo"}
                  </button>
                </div>
              )}

              {aiNote && (
                <div className="rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/8 p-4 text-sm text-[var(--brand-text)]">
                  {aiNote.rationale && <p>{aiNote.rationale}</p>}
                  {aiNote.suggestedTemplateId &&
                    aiNote.suggestedTemplateId !== templateId && (
                      <button
                        type="button"
                        onClick={() => {
                          setTemplateId(
                            aiNote.suggestedTemplateId as TemplateId,
                          );
                        }}
                        className="mt-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--brand-accent)] underline"
                      >
                        Switch to the{" "}
                        {getTemplate(aiNote.suggestedTemplateId)?.name} template
                      </button>
                    )}
                </div>
              )}

              <Field
                label="Brand color"
                error={
                  colorValid ? undefined : "Use a 6-digit hex like #2D6B4A."
                }
                hint="Drives your storefront's headers, buttons, and accents."
              >
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label="Brand color"
                    value={
                      colorValid ? primaryColor : template.defaultPrimaryColor
                    }
                    onChange={(e) => {
                      setPrimaryColor(e.target.value);
                      setColorTouched(true);
                    }}
                    className="h-11 w-14 cursor-pointer rounded-md border border-[var(--brand-border-2)] bg-white p-1"
                  />
                  <input
                    type="text"
                    aria-label="Brand color hex"
                    value={primaryColor}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setPrimaryColor(v);
                      setColorTouched(true);
                    }}
                    className="w-32 rounded-md border border-[var(--brand-border-2)] bg-white px-3 py-2.5 font-mono text-sm text-[var(--brand-text)] outline-none focus:border-[var(--brand-accent)]"
                  />
                </div>
              </Field>

              <div className="flex gap-3">
                <BackButton onClick={() => setStep(1)} />
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 whitespace-nowrap rounded-md bg-[var(--brand-ink)] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--brand-ink-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createTenant.isPending ? "Creating…" : "Create store →"}
                </button>
              </div>

              <p className="text-center text-xs text-[var(--brand-muted)]">
                By creating a store you agree to our{" "}
                <a
                  href="/legal/terms"
                  className="text-[var(--brand-accent)] hover:underline"
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="/legal/privacy"
                  className="text-[var(--brand-accent)] hover:underline"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>

            {/* Live preview: chosen template surfaces + ink derived from the color */}
            <aside aria-label="Storefront preview">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-muted)]">
                Preview
              </p>
              <div
                className="mt-2 overflow-hidden rounded-xl border"
                style={{ borderColor: template.cssVars["--brand-border"] }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{
                    backgroundColor:
                      previewPalette?.["--brand-ink"] ?? primaryColor,
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
                      style={{
                        backgroundColor:
                          previewPalette?.["--brand-accent"] ?? "#b8963e",
                      }}
                    />
                  )}
                  <span className="truncate font-serif text-sm text-white">
                    {name.trim() || "Your store"}
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
                    style={{
                      backgroundColor:
                        previewPalette?.["--brand-accent"] ?? "#b8963e",
                    }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-16 rounded-md"
                        style={{
                          backgroundColor: template.cssVars["--brand-surface"],
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="inline-block rounded px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-white"
                    style={{
                      backgroundColor:
                        previewPalette?.["--brand-ink"] ?? primaryColor,
                    }}
                  >
                    Add to cart
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--brand-muted)]">
                {template.name} template · {primaryColor}
              </p>
            </aside>
          </div>
        )}
      </form>
    </Container>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap rounded-md border border-[var(--brand-ink)]/25 px-5 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
    >
      ← Back
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
