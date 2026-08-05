/**
 * ProductImageManager — Admin-only component to manage extra images for a product.
 * Shown inline in the Admin panel product table row expansion.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
// Ensure the shared i18n instance is initialized even when this block is
// pulled in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import { toast } from "sonner";
import {
  ImagePlus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

interface Props {
  productId: number;
  productName: string;
}

/**
 * Ready-made styles for the AI photo generator (1 credit per image).
 *
 * The `prompt` is what the model is given and stays English in every UI
 * language — it is an instruction to the image model, not merchant-facing
 * copy; only the `labelKey` shown in the dropdown is translated.
 */
const AI_STYLES = [
  {
    labelKey: "catalog.components.productImages.styleClean",
    prompt:
      "Clean catalogue shot on a seamless white background, soft studio light",
  },
  {
    labelKey: "catalog.components.productImages.styleLifestyle",
    prompt:
      "Elegant lifestyle flat-lay on natural linen with soft morning light",
  },
  {
    labelKey: "catalog.components.productImages.styleMacro",
    prompt:
      "Luxury macro close-up highlighting the material details and texture",
  },
] as const;

export default function ProductImageManager({ productId, productName }: Props) {
  const { t } = useTranslation("admin");
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiStyle, setAiStyle] = useState<string>(AI_STYLES[0].prompt);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: images = [], isLoading } = trpc.products.getImages.useQuery(
    { productId },
    { enabled: expanded },
  );

  const { data: billingStatus } = trpc.billing.getStatus.useQuery(undefined, {
    enabled: expanded,
  });
  // null = unmetered (Pro); a number = shots left this month (Free allowance).
  const remaining =
    billingStatus == null || billingStatus.ai.allowancePerMonth === null
      ? null
      : Math.max(
          0,
          billingStatus.ai.allowancePerMonth -
            (billingStatus.ai.usedThisMonth ?? 0),
        );

  const aiPhotoMutation = trpc.billing.generateProductPhoto.useMutation({
    onSuccess: ({ remainingThisMonth }) => {
      utils.products.getImages.invalidate({ productId });
      utils.billing.getStatus.invalidate();
      utils.billing.photoCreditHistory.invalidate();
      toast.success(
        remainingThisMonth === null
          ? t("catalog.components.productImages.toastAiAdded")
          : t("catalog.components.productImages.toastAiAddedRemaining", {
              count: remainingThisMonth,
            }),
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const addImageMutation = trpc.products.addImage.useMutation({
    onSuccess: () => {
      utils.products.getImages.invalidate({ productId });
      toast.success(t("catalog.components.productImages.toastImageAdded"));
      setUploading(false);
    },
    onError: () => {
      toast.error(t("catalog.components.productImages.toastUploadFailed"));
      setUploading(false);
    },
  });

  const deleteImageMutation = trpc.products.deleteImage.useMutation({
    onSuccess: () => {
      utils.products.getImages.invalidate({ productId });
      toast.success(t("catalog.components.productImages.toastImageRemoved"));
    },
    onError: () =>
      toast.error(t("catalog.components.productImages.toastRemoveFailed")),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 8 * 1024 * 1024) {
        toast.error(
          t("catalog.components.productImages.toastTooLarge", {
            name: file.name,
          }),
        );
        continue;
      }
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          await addImageMutation.mutateAsync({
            productId,
            imageData: dataUrl,
            mimeType: file.type || "image/jpeg",
            sortOrder: images.length + i,
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }

    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] font-sans text-[var(--brand-ink)] hover:text-[var(--brand-accent)] transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded
          ? t("catalog.components.productImages.toggleHide")
          : t("catalog.components.productImages.toggleManage")}
      </button>

      {expanded && (
        <div className="mt-3 p-4 bg-[var(--brand-surface-2)] border border-[var(--brand-border)]">
          <p className="text-xs text-muted-foreground font-sans mb-3">
            {t("catalog.components.productImages.forProductBefore")}{" "}
            <span className="font-medium text-foreground">{productName}</span>{" "}
            {t("catalog.components.productImages.forProductAfter")}
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-sans">
              <Loader2 size={12} className="animate-spin" />{" "}
              {t("catalog.components.productImages.loading")}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {images.map((img) => (
                <div key={img.id} className="relative group w-16 h-16">
                  <img
                    src={img.imageUrl}
                    alt={t("catalog.components.productImages.photoAlt")}
                    className="w-full h-full object-cover border border-[var(--brand-border)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      deleteImageMutation.mutate({ imageId: img.id })
                    }
                    disabled={deleteImageMutation.isPending}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={t(
                      "catalog.components.productImages.removeImage",
                    )}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Upload button */}
              <label className="w-16 h-16 flex flex-col items-center justify-center border border-dashed border-[var(--brand-accent)]/40 bg-white cursor-pointer hover:bg-[var(--brand-surface)] transition-colors text-[var(--brand-accent)]">
                {uploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <ImagePlus size={16} />
                    <span className="text-[9px] uppercase tracking-wider mt-0.5 font-sans">
                      {t("catalog.components.productImages.add")}
                    </span>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>
          )}

          {images.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground font-sans italic">
              {t("catalog.components.productImages.emptyNote")}
            </p>
          )}

          {/* AI photo generation — unmetered on Pro, monthly allowance on
              Free; uses the product's main photo as the source
              (see server/photoCredits.ts). */}
          <div className="mt-3 pt-3 border-t border-[var(--brand-border)]">
            <p className="text-xs font-sans text-muted-foreground mb-2 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[var(--brand-accent)]" />
              {t("catalog.components.productImages.restyle")}
              {remaining !== null && (
                <span className="ml-auto">
                  {t("catalog.components.productImages.shotsLeft", {
                    count: remaining,
                  })}
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={aiStyle}
                onChange={(e) => setAiStyle(e.target.value)}
                className="flex-1 min-w-48 text-xs font-sans border border-[var(--brand-border)] bg-white px-2 py-1.5"
              >
                {AI_STYLES.map((s) => (
                  <option key={s.labelKey} value={s.prompt}>
                    {t(s.labelKey)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={aiPhotoMutation.isPending || remaining === 0}
                onClick={() =>
                  aiPhotoMutation.mutate({ productId, stylePrompt: aiStyle })
                }
                className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] font-sans border border-[var(--brand-accent)]/40 text-[var(--brand-accent)] px-3 py-1.5 hover:bg-[var(--brand-surface)] transition-colors disabled:opacity-50"
                title={
                  remaining === 0
                    ? t("catalog.components.productImages.allowanceUsedTitle")
                    : t("catalog.components.productImages.generateTitle")
                }
              >
                {aiPhotoMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {t("catalog.components.productImages.generate")}
              </button>
            </div>
            {remaining === 0 && (
              <p className="text-xs font-sans text-muted-foreground mt-1.5">
                {t("catalog.components.productImages.allowanceUsedBefore")}{" "}
                <a href="/admin/billing" className="underline">
                  {t("catalog.components.productImages.allowanceLink")}
                </a>{" "}
                {t("catalog.components.productImages.allowanceUsedAfter")}
              </p>
            )}
            <p className="text-[10px] font-sans text-muted-foreground/70 mt-1.5">
              {t("catalog.components.productImages.disclosure")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
