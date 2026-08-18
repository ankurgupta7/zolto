/**
 * Reviews (store plane) — the two things a shopper reads before deciding to
 * trust a shop they have never bought from, on one page:
 *
 *   - the store's Trustpilot profile, connected by pasting a link
 *   - the quotes the merchant publishes at the foot of their home page
 *
 * They share a page because they answer the same question and appear in the
 * same band of the storefront. Both are optional and both are off by default:
 * a store that never opens this page renders neither.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Quote,
  Star,
  Trash2,
} from "lucide-react";
import {
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SettingsCard,
  inputClass,
} from "@/components/admin/ui";
import { useTenantSettings } from "@/components/admin/useTenantSettings";
import { formatTrustScore } from "@shared/trustpilot";

interface QuoteDraft {
  id?: number;
  authorName: string;
  authorTitle: string;
  authorPhotoUrl: string;
  googleId: string;
  quote: string;
  rating: string;
  source: "manual" | "google" | "trustpilot";
  published: boolean;
}

const EMPTY_DRAFT: QuoteDraft = {
  authorName: "",
  authorTitle: "",
  authorPhotoUrl: "",
  googleId: "",
  quote: "",
  rating: "",
  source: "manual",
  published: true,
};

export default function Testimonials() {
  const { t } = useTranslation("admin");
  const utils = trpc.useUtils();
  const { settings, invalidate: invalidateSettings } = useTenantSettings();

  // ── Trustpilot ──────────────────────────────────────────────────────────────
  const status = trpc.trustpilot.status.useQuery();
  const [trustpilotInput, setTrustpilotInput] = useState<string | null>(null);
  // Null means "untouched" — show whatever the server has. A merchant who
  // clears the box is holding "", which is how they disconnect.
  const trustpilotValue = trustpilotInput ?? settings?.trustpilotDomain ?? "";

  const saveSettings = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      invalidateSettings();
      utils.trustpilot.status.invalidate();
      setTrustpilotInput(null);
      toast.success(t("store.reviews.savedToast"));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Testimonials ────────────────────────────────────────────────────────────
  const list = trpc.testimonials.adminList.useQuery();
  const [draft, setDraft] = useState<QuoteDraft | null>(null);

  const afterWrite = (message: string) => ({
    onSuccess: () => {
      utils.testimonials.adminList.invalidate();
      utils.testimonials.list.invalidate();
      setDraft(null);
      toast.success(message);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const create = trpc.testimonials.create.useMutation(
    afterWrite(t("store.reviews.addedToast")),
  );
  const update = trpc.testimonials.update.useMutation(
    afterWrite(t("store.reviews.updatedToast")),
  );
  const setPublished = trpc.testimonials.setPublished.useMutation({
    onSuccess: () => {
      utils.testimonials.adminList.invalidate();
      utils.testimonials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.testimonials.delete.useMutation(
    afterWrite(t("store.reviews.removedToast")),
  );

  const submitDraft = () => {
    if (!draft) return;
    if (!draft.authorName.trim() || !draft.quote.trim()) {
      toast.error(t("store.reviews.nameAndQuoteRequired"));
      return;
    }
    if (
      draft.authorPhotoUrl.trim() &&
      !/^https?:\/\//.test(draft.authorPhotoUrl.trim())
    ) {
      toast.error(t("store.reviews.invalidPhoto"));
      return;
    }
    const rating = draft.rating ? Number(draft.rating) : null;
    const payload = {
      authorName: draft.authorName.trim(),
      // Emptying a box has to clear the value, not leave the old one in place
      // — `null`, never `undefined`.
      authorTitle: draft.authorTitle.trim() || null,
      authorPhotoUrl: draft.authorPhotoUrl.trim() || null,
      googleId: draft.googleId.trim() || null,
      quote: draft.quote.trim(),
      rating,
      source: draft.source,
      published: draft.published,
    };
    if (draft.id) update.mutate({ id: draft.id, ...payload });
    else create.mutate(payload);
  };

  const rows = list.data ?? [];
  const rating = status.data?.summary ?? null;

  return (
    <div>
      <PageHeader
        title={t("store.reviews.title")}
        description={t("store.reviews.description")}
      />

      {/* ── Trustpilot ─────────────────────────────────────────────────────── */}
      <SettingsCard
        title={t("store.reviews.trustpilotTitle")}
        description={t("store.reviews.trustpilotDescription")}
        footer={
          <PrimaryButton
            loading={saveSettings.isPending}
            onClick={() =>
              saveSettings.mutate({
                trustpilotDomain: trustpilotValue.trim() || null,
              })
            }
          >
            {t("store.reviews.save")}
          </PrimaryButton>
        }
      >
        <div className="space-y-4">
          <Field
            label={t("store.reviews.trustpilotField")}
            htmlFor="trustpilot-domain"
            hint={t("store.reviews.trustpilotHint")}
          >
            <input
              id="trustpilot-domain"
              type="text"
              className={inputClass}
              placeholder="https://ch.trustpilot.com/review/example.ch"
              value={trustpilotValue}
              onChange={(e) => setTrustpilotInput(e.target.value)}
            />
          </Field>

          {status.data?.domain && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              {rating ? (
                <>
                  <Star
                    className="h-4 w-4 text-[var(--brand-accent)]"
                    fill="currentColor"
                    strokeWidth={0}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground tabular-nums">
                    {formatTrustScore(rating.trustScore)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {t("store.reviews.reviewCount", {
                      count: rating.numberOfReviews,
                    })}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {status.data.ratingsAvailable
                    ? t("store.reviews.noRatingYet")
                    : t("store.reviews.ratingsUnavailable")}
                </span>
              )}
              <a
                href={status.data.profileUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {t("store.reviews.viewProfile")}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          )}

          {status.data?.domain && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings?.trustpilotShowRating ?? true}
                onChange={(e) =>
                  saveSettings.mutate({
                    trustpilotShowRating: e.target.checked,
                  })
                }
              />
              {t("store.reviews.showRating")}
            </label>
          )}
        </div>
      </SettingsCard>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <SettingsCard
        title={t("store.reviews.quotesTitle")}
        description={t("store.reviews.quotesDescription")}
        footer={
          !draft && (
            <PrimaryButton onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("store.reviews.add")}
            </PrimaryButton>
          )
        }
      >
        {draft && (
          <form
            className="mb-6 space-y-4 rounded-lg border bg-muted/20 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitDraft();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("store.reviews.authorName")}
                htmlFor="quote-author"
              >
                <input
                  id="quote-author"
                  className={inputClass}
                  value={draft.authorName}
                  onChange={(e) =>
                    setDraft({ ...draft, authorName: e.target.value })
                  }
                />
              </Field>
              <Field
                label={t("store.reviews.authorTitle")}
                htmlFor="quote-title"
                hint={t("store.reviews.authorTitleHint")}
              >
                <input
                  id="quote-title"
                  className={inputClass}
                  value={draft.authorTitle}
                  onChange={(e) =>
                    setDraft({ ...draft, authorTitle: e.target.value })
                  }
                />
              </Field>
            </div>

            <Field label={t("store.reviews.quote")} htmlFor="quote-body">
              <textarea
                id="quote-body"
                rows={3}
                className={inputClass}
                value={draft.quote}
                onChange={(e) => setDraft({ ...draft, quote: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("store.reviews.photo")}
                htmlFor="quote-photo"
                hint={t("store.reviews.photoHint")}
              >
                <input
                  id="quote-photo"
                  className={inputClass}
                  placeholder="https://…"
                  value={draft.authorPhotoUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, authorPhotoUrl: e.target.value })
                  }
                />
              </Field>
              <Field
                label={t("store.reviews.googleId")}
                htmlFor="quote-google"
                hint={t("store.reviews.googleIdHint")}
              >
                <input
                  id="quote-google"
                  className={inputClass}
                  value={draft.googleId}
                  onChange={(e) =>
                    setDraft({ ...draft, googleId: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("store.reviews.rating")} htmlFor="quote-rating">
                <select
                  id="quote-rating"
                  className={inputClass}
                  value={draft.rating}
                  onChange={(e) =>
                    setDraft({ ...draft, rating: e.target.value })
                  }
                >
                  <option value="">{t("store.reviews.noRating")}</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={String(n)}>
                      {t("store.reviews.starsOption", { count: n })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("store.reviews.source")} htmlFor="quote-source">
                <select
                  id="quote-source"
                  className={inputClass}
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      source: e.target.value as QuoteDraft["source"],
                    })
                  }
                >
                  <option value="manual">
                    {t("store.reviews.sourceManual")}
                  </option>
                  <option value="google">
                    {t("store.reviews.sourceGoogle")}
                  </option>
                  <option value="trustpilot">
                    {t("store.reviews.sourceTrustpilot")}
                  </option>
                </select>
              </Field>
            </div>

            <div className="flex items-center justify-end gap-3">
              <SecondaryButton type="button" onClick={() => setDraft(null)}>
                {t("store.reviews.cancel")}
              </SecondaryButton>
              <PrimaryButton
                type="submit"
                loading={create.isPending || update.isPending}
              >
                {/* "Save quote", not "Save" — the Trustpilot card above has
                    its own Save, and two identically named buttons on one page
                    are ambiguous to anyone navigating by label. */}
                {draft.id
                  ? t("store.reviews.saveQuote")
                  : t("store.reviews.add")}
              </PrimaryButton>
            </div>
          </form>
        )}

        {list.isLoading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Quote className="h-8 w-8" aria-hidden="true" />}
            title={t("store.reviews.emptyTitle")}
            description={t("store.reviews.emptyDescription")}
            note={t("store.reviews.emptyNote")}
          />
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">“{row.quote}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      row.authorName,
                      row.authorTitle,
                      row.rating
                        ? t("store.reviews.starsOption", { count: row.rating })
                        : null,
                      // The label, not the raw enum: a row reading
                      // "… · 4 stars · trustpilot" looks like a leaked
                      // database value next to the sentence above it.
                      row.source === "google"
                        ? t("store.reviews.sourceGoogle")
                        : row.source === "trustpilot"
                          ? t("store.reviews.sourceTrustpilot")
                          : null,
                      !row.published ? t("store.reviews.hidden") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <label className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={row.published}
                      aria-label={t("store.reviews.publishedLabel", {
                        name: row.authorName,
                      })}
                      onChange={(e) =>
                        setPublished.mutate({
                          id: row.id,
                          published: e.target.checked,
                        })
                      }
                    />
                    {t("store.reviews.published")}
                  </label>
                  <button
                    type="button"
                    aria-label={t("store.reviews.editLabel", {
                      name: row.authorName,
                    })}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        authorName: row.authorName,
                        authorTitle: row.authorTitle ?? "",
                        authorPhotoUrl: row.authorPhotoUrl ?? "",
                        googleId: row.googleId ?? "",
                        quote: row.quote,
                        rating: row.rating ? String(row.rating) : "",
                        source: row.source,
                        published: row.published,
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("store.reviews.deleteLabel", {
                      name: row.authorName,
                    })}
                    className="rounded p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => remove.mutate({ id: row.id })}
                  >
                    {remove.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  );
}
