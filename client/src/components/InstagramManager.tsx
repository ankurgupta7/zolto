import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
// Ensure the shared i18n instance is initialized even when this block is
// pulled in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  GripVertical,
} from "lucide-react";

export default function InstagramManager() {
  const { t } = useTranslation("admin");
  const [newUrl, setNewUrl] = useState("");
  const utils = trpc.useUtils();

  const { data: posts, isLoading } = trpc.instagram.list.useQuery();

  const addMutation = trpc.instagram.add.useMutation({
    onSuccess: () => {
      utils.instagram.list.invalidate();
      setNewUrl("");
      toast.success(t("catalog.components.instagram.addedToast"));
    },
    onError: (err) => {
      toast.error(err.message || t("catalog.components.instagram.addFailed"));
    },
  });

  const deleteMutation = trpc.instagram.delete.useMutation({
    onSuccess: () => {
      utils.instagram.list.invalidate();
      toast.success(t("catalog.components.instagram.removedToast"));
    },
    onError: () => {
      toast.error(t("catalog.components.instagram.removeFailed"));
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    addMutation.mutate({
      postUrl: newUrl.trim(),
      sortOrder: posts?.length ?? 0,
    });
  };

  return (
    <div className="space-y-4">
      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-3">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://www.instagram.com/p/XXXXX/"
          className="flex-1 border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
          required
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !newUrl.trim()}
          className="flex items-center gap-2 bg-[var(--brand-ink)] text-white px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {addMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          {t("catalog.components.instagram.add")}
        </button>
      </form>

      {/* Post list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 size={16} className="animate-spin" />
          <span className="font-sans">
            {t("catalog.components.instagram.loading")}
          </span>
        </div>
      ) : !posts || posts.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[var(--brand-ink)]/20">
          <p className="text-muted-foreground text-sm font-sans">
            {t("catalog.components.instagram.emptyTitle")}
          </p>
          <p className="text-muted-foreground text-xs font-sans mt-1 opacity-60">
            {t("catalog.components.instagram.emptyTip")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans mb-3">
            {t("catalog.components.instagram.countInGrid", {
              count: posts.length,
            })}
          </p>
          {posts.map((post, idx) => (
            <div
              key={post.id}
              className="flex items-center gap-3 p-3 border border-[var(--brand-border)] bg-[var(--brand-surface-2)] group"
            >
              <GripVertical
                size={14}
                className="text-muted-foreground/40 flex-shrink-0"
              />
              <span className="text-xs text-muted-foreground font-sans w-5 flex-shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1 text-sm font-sans text-foreground truncate">
                {post.postUrl}
              </span>
              <a
                href={post.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-muted-foreground hover:text-[var(--brand-ink)] transition-colors flex-shrink-0"
                title={t("catalog.components.instagram.openPost")}
              >
                <ExternalLink size={14} />
              </a>
              <button
                type="button"
                onClick={() => deleteMutation.mutate({ id: post.id })}
                disabled={deleteMutation.isPending}
                className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors flex-shrink-0 disabled:opacity-40"
                title={t("catalog.components.instagram.removeFromGrid")}
              >
                {deleteMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground font-sans opacity-60">
        {t("catalog.components.instagram.footnote")}
      </p>
    </div>
  );
}
