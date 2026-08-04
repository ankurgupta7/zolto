import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { isStoreAdminRole } from "@/admin/nav";
import { trpc } from "@/lib/trpc";
// This page renders outside the admin shell, so nothing else in its import
// graph initialises the shared i18n instance — pull it in explicitly.
import "@/lib/i18n";
import { toast } from "sonner";
import { SignInOptions } from "@/components/SignInOptions";
import { Loader2, Copy, CheckCircle2, Trash2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import BulkChangeReviewDialog from "@/components/BulkChangeReviewDialog";

export default function DuplicateCleanup() {
  const { t } = useTranslation("admin");
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();

  const {
    data: groups,
    isLoading,
    refetch,
  } = trpc.products.findDuplicates.useQuery(undefined, {
    enabled: isAuthenticated && isStoreAdminRole(user?.role),
  });
  type DuplicateProduct = NonNullable<
    typeof groups
  >[number]["products"][number];

  // key -> id the admin wants to keep for that group
  const [selection, setSelection] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!groups) return;
    setSelection((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.key] === undefined) next[g.key] = g.suggestedKeepId;
      }
      return next;
    });
  }, [groups]);

  const mergeMutation = trpc.products.mergeDuplicates.useMutation({
    onSuccess: (result) => {
      toast.success(t("ops.duplicates.removed", { count: result.removed }));
      utils.products.adminList.invalidate();
      utils.products.list.invalidate();
      setShowConfirm(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
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
    const group = groups?.find((g) => g.key === key);
    if (!group) return;
    const keepId = selection[key];
    const ids = group.products.filter((p) => p.id !== keepId).map((p) => p.id);
    if (ids.length === 0) return;
    setCandidateIds(ids);
    setShowConfirm(true);
  };

  const openConfirmForAll = () => {
    if (!groups || groups.length === 0) return;
    const ids = groups.flatMap((g) => {
      const keepId = selection[g.key] ?? g.suggestedKeepId;
      return g.products.filter((p) => p.id !== keepId).map((p) => p.id);
    });
    if (ids.length === 0) return;
    setCandidateIds(ids);
    setShowConfirm(true);
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="animate-spin text-[var(--brand-ink)]" size={32} />
      </div>
    );

  if (!isAuthenticated)
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            {t("ops.duplicates.adminRequired")}
          </h2>
          <SignInOptions className="text-left" next={window.location.href} />
        </div>
      </div>
    );

  if (!isStoreAdminRole(user?.role))
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            {t("ops.duplicates.accessDenied")}
          </h2>
        </div>
      </div>
    );

  return (
    <div className="page-enter pt-20 min-h-screen bg-[var(--brand-surface)]">
      {/* Header */}
      <section className="bg-[var(--brand-ink)] py-10">
        <div className="container flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-1 font-sans">
              {t("ops.duplicates.eyebrow")}
            </p>
            <h1 className="font-serif text-white text-2xl">
              {t("ops.duplicates.title")}
            </h1>
            <p className="text-white/50 text-xs font-sans mt-1">
              {t("ops.duplicates.subtitle")}
            </p>
          </div>
          <Link
            href="/admin"
            className="text-white/60 hover:text-white text-xs uppercase tracking-[0.15em] font-sans transition-colors"
          >
            {t("ops.duplicates.backToAdmin")}
          </Link>
        </div>
      </section>

      <div className="container py-8 max-w-5xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2
              className="animate-spin text-[var(--brand-ink)]"
              size={28}
            />
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="bg-white border border-[var(--brand-border)] p-10 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-green-600" />
            <p className="font-serif text-foreground text-lg">
              {t("ops.duplicates.noneFound")}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-white border border-[var(--brand-border)] px-4 py-2.5">
                <Copy
                  size={16}
                  className="text-[var(--brand-accent)] flex-shrink-0"
                />
                <span className="text-sm font-sans">
                  <strong>{groups.length}</strong>{" "}
                  {t("ops.duplicates.groupsFound", { count: groups.length })}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="flex items-center gap-2 border border-[var(--brand-ink)]/20 text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-[var(--brand-ink)] hover:text-foreground transition-colors"
                >
                  <RefreshCw size={14} />
                  {t("ops.duplicates.refresh")}
                </button>
                <button
                  type="button"
                  onClick={openConfirmForAll}
                  className="flex items-center gap-2 bg-red-600 text-white px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {t("ops.duplicates.deleteAll")}
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground font-sans mb-6">
              {t("ops.duplicates.warning")}
            </p>

            <div className="space-y-6">
              {groups.map((group) => (
                <div
                  key={group.key}
                  className="bg-white border border-[var(--brand-border)] overflow-hidden"
                >
                  <div className="px-5 py-3 bg-[var(--brand-surface)] border-b border-[var(--brand-border)] flex items-center justify-between">
                    <p className="font-serif text-foreground text-sm">
                      {group.products[0].name}{" "}
                      <span className="text-muted-foreground text-xs font-sans">
                        {t("ops.duplicates.copies", {
                          count: group.products.length,
                        })}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => openConfirmForGroup(group.key)}
                      className="text-xs uppercase tracking-[0.12em] font-sans text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      {t("ops.duplicates.deleteRest")}
                    </button>
                  </div>
                  <table className="w-full text-sm font-sans">
                    <tbody>
                      {group.products.map((p: DuplicateProduct) => (
                        <tr
                          key={p.id}
                          className="border-b border-[var(--brand-border)] last:border-0"
                        >
                          <td className="px-5 py-3 w-8">
                            <input
                              type="radio"
                              name={`keep-${group.key}`}
                              checked={selection[group.key] === p.id}
                              onChange={() =>
                                setSelection((prev) => ({
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
                            {t("ops.duplicates.qty", { qty: p.quantity })}
                          </td>
                          <td className="px-2 py-3">
                            {p.visible ? (
                              <span className="text-green-700">
                                {t("ops.duplicates.visible")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {t("ops.duplicates.hidden")}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground">
                            {p.imageUrl
                              ? t("ops.duplicates.hasPhoto")
                              : t("ops.duplicates.noPhoto")}
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
        title={t("ops.duplicates.confirmTitle")}
        description={t("ops.duplicates.confirmDescription")}
        destructive
        confirmLabel={t("ops.duplicates.confirmLabel")}
        items={candidateIds.map((id) => {
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
        onConfirm={(selectedIds) => mergeMutation.mutate({ ids: selectedIds })}
      />
    </div>
  );
}
