import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { Loader2, Copy, CheckCircle2, Trash2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import BulkChangeReviewDialog from "@/components/BulkChangeReviewDialog";

export default function DuplicateCleanup() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();

  const {
    data: groups,
    isLoading,
    refetch,
  } = trpc.products.findDuplicates.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  type DuplicateProduct = NonNullable<
    typeof groups
  >[number]["products"][number];

  // key -> id the admin wants to keep for that group
  const [selection, setSelection] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!groups) return;
    setSelection(prev => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.key] === undefined) next[g.key] = g.suggestedKeepId;
      }
      return next;
    });
  }, [groups]);

  const mergeMutation = trpc.products.mergeDuplicates.useMutation({
    onSuccess: result => {
      toast.success(
        `Removed ${result.removed} duplicate product${result.removed !== 1 ? "s" : ""}`
      );
      utils.products.adminList.invalidate();
      utils.products.list.invalidate();
      setShowConfirm(false);
      refetch();
    },
    onError: e => toast.error(e.message),
  });

  // The radio buttons above already let the admin choose what to keep per
  // group; this dialog is the final "here's exactly what gets permanently
  // deleted, confirm or back out" step before anything is written.
  const [showConfirm, setShowConfirm] = useState(false);
  const [candidateIds, setCandidateIds] = useState<number[]>([]);

  const productById = new Map<number, DuplicateProduct>();
  for (const g of groups ?? []) {
    for (const p of g.products) productById.set(p.id, p);
  }

  const openConfirmForGroup = (key: string) => {
    const group = groups?.find(g => g.key === key);
    if (!group) return;
    const keepId = selection[key];
    const ids = group.products.filter(p => p.id !== keepId).map(p => p.id);
    if (ids.length === 0) return;
    setCandidateIds(ids);
    setShowConfirm(true);
  };

  const openConfirmForAll = () => {
    if (!groups || groups.length === 0) return;
    const ids = groups.flatMap(g => {
      const keepId = selection[g.key] ?? g.suggestedKeepId;
      return g.products.filter(p => p.id !== keepId).map(p => p.id);
    });
    if (ids.length === 0) return;
    setCandidateIds(ids);
    setShowConfirm(true);
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="animate-spin text-[#2D2620]" size={32} />
      </div>
    );

  if (!isAuthenticated)
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            Admin Required
          </h2>
          <a
            href={getLoginUrl()}
            className="inline-flex items-center gap-2 bg-[#2D2620] text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[#3A3028] transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );

  if (user?.role !== "admin")
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            Access Denied
          </h2>
        </div>
      </div>
    );

  return (
    <div className="page-enter pt-20 min-h-screen bg-[#EDE7DF]">
      {/* Header */}
      <section className="bg-[#2D2620] py-10">
        <div className="container flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-1 font-sans">
              Admin
            </p>
            <h1 className="font-serif text-white text-2xl">
              Duplicate Cleanup
            </h1>
            <p className="text-white/50 text-xs font-sans mt-1">
              Products that share the exact same name — usually left behind by
              re-importing a spreadsheet
            </p>
          </div>
          <Link
            href="/admin"
            className="text-white/60 hover:text-white text-xs uppercase tracking-[0.15em] font-sans transition-colors"
          >
            ← Admin
          </Link>
        </div>
      </section>

      <div className="container py-8 max-w-5xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[#2D2620]" size={28} />
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="bg-white border border-[#E0D8CC] p-10 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-green-600" />
            <p className="font-serif text-foreground text-lg">
              No duplicate product names found
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-white border border-[#E0D8CC] px-4 py-2.5">
                <Copy size={16} className="text-[#B8963E] flex-shrink-0" />
                <span className="text-sm font-sans">
                  <strong>{groups.length}</strong> duplicate group
                  {groups.length !== 1 ? "s" : ""} found
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="flex items-center gap-2 border border-[#2D2620]/20 text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-[#2D2620] hover:text-foreground transition-colors"
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={openConfirmForAll}
                  className="flex items-center gap-2 bg-red-600 text-white px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Delete All Duplicates
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground font-sans mb-6">
              Deleting a duplicate permanently removes it from the catalogue —
              this cannot be undone. Pick which copy of each product to keep.
            </p>

            <div className="space-y-6">
              {groups.map(group => (
                <div
                  key={group.key}
                  className="bg-white border border-[#E0D8CC] overflow-hidden"
                >
                  <div className="px-5 py-3 bg-[#EDE7DF] border-b border-[#E0D8CC] flex items-center justify-between">
                    <p className="font-serif text-foreground text-sm">
                      {group.products[0].name}{" "}
                      <span className="text-muted-foreground text-xs font-sans">
                        ({group.products.length} copies)
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => openConfirmForGroup(group.key)}
                      className="text-xs uppercase tracking-[0.12em] font-sans text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      Delete the rest
                    </button>
                  </div>
                  <table className="w-full text-sm font-sans">
                    <tbody>
                      {group.products.map((p: DuplicateProduct) => (
                        <tr
                          key={p.id}
                          className="border-b border-[#E0D8CC] last:border-0"
                        >
                          <td className="px-5 py-3 w-8">
                            <input
                              type="radio"
                              name={`keep-${group.key}`}
                              checked={selection[group.key] === p.id}
                              onChange={() =>
                                setSelection(prev => ({
                                  ...prev,
                                  [group.key]: p.id,
                                }))
                              }
                            />
                          </td>
                          <td className="px-2 py-3 text-muted-foreground">
                            #{p.id}
                          </td>
                          <td className="px-2 py-3">
                            CHF {Number(p.price).toFixed(2)}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground">
                            Qty {p.quantity}
                          </td>
                          <td className="px-2 py-3">
                            {p.visible ? (
                              <span className="text-green-700">Visible</span>
                            ) : (
                              <span className="text-muted-foreground">
                                Hidden
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground">
                            {p.imageUrl ? "Has photo" : "No photo"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BulkChangeReviewDialog
        open={showConfirm}
        title="Confirm deleting duplicates"
        description="These products will be permanently removed from the catalogue, including their photos. This cannot be undone."
        destructive
        confirmLabel="Deletion"
        items={candidateIds.map(id => {
          const p = productById.get(id);
          return {
            id,
            label: p
              ? `${p.name} · #${id} · CHF ${Number(p.price).toFixed(2)}`
              : `#${id}`,
          };
        })}
        isApplying={mergeMutation.isPending}
        onCancel={() => setShowConfirm(false)}
        onConfirm={selectedIds => mergeMutation.mutate({ ids: selectedIds })}
      />
    </div>
  );
}
