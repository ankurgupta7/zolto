/**
 * ProductImageManager — Admin-only component to manage extra images for a product.
 * Shown inline in the Admin panel product table row expansion.
 */
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
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

/** Ready-made styles for the AI photo generator (1 credit per image). */
const AI_STYLES = [
  "Clean catalogue shot on a seamless white background, soft studio light",
  "Elegant lifestyle flat-lay on natural linen with soft morning light",
  "Luxury macro close-up highlighting the material details and texture",
] as const;

export default function ProductImageManager({ productId, productName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiStyle, setAiStyle] = useState<string>(AI_STYLES[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: images = [], isLoading } = trpc.products.getImages.useQuery(
    { productId },
    { enabled: expanded },
  );

  const { data: billingStatus } = trpc.billing.getStatus.useQuery(undefined, {
    enabled: expanded,
  });
  const creditBalance = billingStatus?.photoCredits.balance ?? null;

  const aiPhotoMutation = trpc.billing.generateProductPhoto.useMutation({
    onSuccess: ({ balance }) => {
      utils.products.getImages.invalidate({ productId });
      utils.billing.getStatus.invalidate();
      utils.billing.photoCreditHistory.invalidate();
      toast.success(`AI photo added — ${balance} credits left`);
    },
    onError: (err) => toast.error(err.message),
  });

  const addImageMutation = trpc.products.addImage.useMutation({
    onSuccess: () => {
      utils.products.getImages.invalidate({ productId });
      toast.success("Image added");
      setUploading(false);
    },
    onError: () => {
      toast.error("Failed to upload image");
      setUploading(false);
    },
  });

  const deleteImageMutation = trpc.products.deleteImage.useMutation({
    onSuccess: () => {
      utils.products.getImages.invalidate({ productId });
      toast.success("Image removed");
    },
    onError: () => toast.error("Failed to remove image"),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 8 MB)`);
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
        {expanded ? "Hide" : "Manage"} Extra Images
      </button>

      {expanded && (
        <div className="mt-3 p-4 bg-[var(--brand-surface-2)] border border-[var(--brand-border)]">
          <p className="text-xs text-muted-foreground font-sans mb-3">
            Extra images for{" "}
            <span className="font-medium text-foreground">{productName}</span> —
            swipeable in the product modal.
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-sans">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {images.map((img) => (
                <div key={img.id} className="relative group w-16 h-16">
                  <img
                    src={img.imageUrl}
                    alt="Product piece"
                    className="w-full h-full object-cover border border-[var(--brand-border)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      deleteImageMutation.mutate({ imageId: img.id })
                    }
                    disabled={deleteImageMutation.isPending}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove image"
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
                      Add
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
              No extra images yet. Click the + to upload.
            </p>
          )}

          {/* AI photo generation — 1 credit per image, uses the product's
              main photo as the source (see server/photoCredits.ts). */}
          <div className="mt-3 pt-3 border-t border-[var(--brand-border)]">
            <p className="text-xs font-sans text-muted-foreground mb-2 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[var(--brand-accent)]" />
              Restyle the main photo with AI
              {creditBalance !== null && (
                <span className="ml-auto">
                  {creditBalance} credit{creditBalance === 1 ? "" : "s"} left
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
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={aiPhotoMutation.isPending || creditBalance === 0}
                onClick={() =>
                  aiPhotoMutation.mutate({ productId, stylePrompt: aiStyle })
                }
                className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] font-sans border border-[var(--brand-accent)]/40 text-[var(--brand-accent)] px-3 py-1.5 hover:bg-[var(--brand-surface)] transition-colors disabled:opacity-50"
                title={
                  creditBalance === 0
                    ? "No AI photo credits left — top up under Plan & Billing"
                    : "Generate an AI-styled image (uses 1 credit)"
                }
              >
                {aiPhotoMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                Generate (1 credit)
              </button>
            </div>
            {creditBalance === 0 && (
              <p className="text-xs font-sans text-muted-foreground mt-1.5">
                Out of credits — top up under{" "}
                <a href="/admin/billing" className="underline">
                  Plan &amp; Billing
                </a>
                .
              </p>
            )}
            <p className="text-[10px] font-sans text-muted-foreground/70 mt-1.5">
              AI-styled images are disclosed as AI-generated.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
