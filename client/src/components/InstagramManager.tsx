import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ExternalLink, GripVertical } from "lucide-react";

export default function InstagramManager() {
  const [newUrl, setNewUrl] = useState("");
  const utils = trpc.useUtils();

  const { data: posts, isLoading } = trpc.instagram.list.useQuery();

  const addMutation = trpc.instagram.add.useMutation({
    onSuccess: () => {
      utils.instagram.list.invalidate();
      setNewUrl("");
      toast.success("Post added to grid");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add post");
    },
  });

  const deleteMutation = trpc.instagram.delete.useMutation({
    onSuccess: () => {
      utils.instagram.list.invalidate();
      toast.success("Post removed");
    },
    onError: () => {
      toast.error("Failed to remove post");
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    addMutation.mutate({ postUrl: newUrl.trim(), sortOrder: posts?.length ?? 0 });
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
          className="flex-1 border border-[#2D2620]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[#B8963E] transition-colors bg-transparent"
          required
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !newUrl.trim()}
          className="flex items-center gap-2 bg-[#2D2620] text-white px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[#3A3028] transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {addMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </form>

      {/* Post list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 size={16} className="animate-spin" />
          <span className="font-sans">Loading posts…</span>
        </div>
      ) : !posts || posts.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[#2D2620]/20">
          <p className="text-muted-foreground text-sm font-sans">
            No posts added yet. Paste an Instagram post URL above to get started.
          </p>
          <p className="text-muted-foreground text-xs font-sans mt-1 opacity-60">
            Tip: Open a post on Instagram, copy the URL from your browser, and paste it here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans mb-3">
            {posts.length} post{posts.length !== 1 ? "s" : ""} in grid
          </p>
          {posts.map((post, idx) => (
            <div
              key={post.id}
              className="flex items-center gap-3 p-3 border border-[#E0D8CC] bg-[#FAF8F4] group"
            >
              <GripVertical size={14} className="text-muted-foreground/40 flex-shrink-0" />
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
                className="p-1.5 text-muted-foreground hover:text-[#2D2620] transition-colors flex-shrink-0"
                title="Open post"
              >
                <ExternalLink size={14} />
              </a>
              <button
                type="button"
                onClick={() => deleteMutation.mutate({ id: post.id })}
                disabled={deleteMutation.isPending}
                className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors flex-shrink-0 disabled:opacity-40"
                title="Remove from grid"
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
        Posts appear on the home page as embedded Instagram widgets. Supports both /p/ posts and /reel/ reels.
      </p>
    </div>
  );
}
