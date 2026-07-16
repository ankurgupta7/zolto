import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@shared/types";
import { useTranslation } from "react-i18next";
import {
  Upload,
  X,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Layers,
  Ungroup,
  Sparkles,
  ShoppingBag,
  Image as ImageIcon,
  AlertCircle,
  Search,
  Merge,
  PlusCircle,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoItem {
  id: string;
  dataUrl: string;
  mimeType: string;
  fileName: string;
  groupId: string | null;
}

interface Group {
  id: string;
  label: string;
}

interface ReviewCard {
  groupId: string;
  photoIds: string[];
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  category: ProductCategory;
  price: string;
  confirmed: boolean;
  aiSuccess: boolean;
}

interface MatchResult {
  tempId: string;
  matchedProductId: number | null;
  matchedProductName: string | null;
  confidence: "exact" | "partial" | "none";
}

interface MatchDecision {
  action: "create-new" | "add-to-existing";
  updateDescription: boolean;
}

// AI bulk-upload categorises a single piece per card, so "Sets" is folded into
// "Other" and omitted here — kept in sync with the server-side AI extractors.
const CATEGORIES: ProductCategory[] = PRODUCT_CATEGORIES.filter(
  c => c !== "Sets"
);
const GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t } = useTranslation();
  const steps = [
    { n: 1, label: t("bulkUpload.step1") },
    { n: 2, label: t("bulkUpload.step2") },
    { n: 3, label: t("bulkUpload.step3") },
    { n: 4, label: t("bulkUpload.step4") },
  ];
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-shrink-0">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-[0.12em] font-sans ${
              step === s.n
                ? "bg-[var(--brand-ink)] text-white"
                : step > s.n
                  ? "bg-[var(--brand-accent)]/20 text-[var(--brand-accent)]"
                  : "bg-transparent text-muted-foreground"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                step > s.n
                  ? "bg-[var(--brand-accent)] text-white"
                  : step === s.n
                    ? "bg-white text-[var(--brand-ink)]"
                    : "border border-current"
              }`}
            >
              {step > s.n ? "✓" : s.n}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight
              size={14}
              className="text-muted-foreground/40 flex-shrink-0"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BulkUpload() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const { t } = useTranslation();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    new Set()
  );
  const [groupingMode, setGroupingMode] = useState(false);
  const [reviewCards, setReviewCards] = useState<ReviewCard[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [findingMatches, setFindingMatches] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchDecisions, setMatchDecisions] = useState<
    Map<string, MatchDecision>
  >(new Map());
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    created: number;
    updated: number;
    failed: string[];
    extraImageWarnings?: string[];
  } | null>(null);

  const bulkAnalyzeMutation = trpc.products.bulkAnalyze.useMutation();
  const bulkCreateMutation = trpc.products.bulkCreate.useMutation();
  const findMatchesMutation = trpc.products.findMatches.useMutation();
  const bulkUpsertImagesMutation =
    trpc.products.bulkUpsertImages.useMutation();

  // ── Step 1: Photo selection ──────────────────────────────────────────────────

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      const MAX_FILE_SIZE = 8 * 1024 * 1024;
      const ALLOWED_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ];

      const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
      const badType = files.filter(
        f => f.type && !ALLOWED_TYPES.includes(f.type)
      );

      if (oversized.length > 0) {
        toast.error(
          `${oversized.length} file(s) exceed 8 MB and were skipped: ${oversized.map(f => f.name).join(", ")}`
        );
      }
      if (badType.length > 0) {
        toast.error(
          `${badType.length} file(s) have unsupported formats and were skipped: ${badType.map(f => f.name).join(", ")}`
        );
      }

      const validFiles = files.filter(
        f =>
          f.size <= MAX_FILE_SIZE &&
          (!f.type || ALLOWED_TYPES.includes(f.type))
      );
      if (validFiles.length === 0) return;

      const readers = validFiles.map(
        file =>
          new Promise<PhotoItem | null>(resolve => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                dataUrl: reader.result as string,
                mimeType: file.type || "image/jpeg",
                fileName: file.name,
                groupId: null,
              });
            };
            reader.onerror = () => {
              toast.error(`Error reading ${file.name}`);
              resolve(null);
            };
            reader.readAsDataURL(file);
          })
      );

      Promise.all(readers).then(results => {
        const newPhotos = results.filter((p): p is PhotoItem => p !== null);
        setPhotos(prev => [...prev, ...newPhotos]);
        if (newPhotos.length > 0) {
          toast.success(
            t("bulkUpload.photosSelected", { count: newPhotos.length })
          );
        }
      });

      e.target.value = "";
    },
    [t]
  );

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
    setPhotos(prev =>
      prev.map(p => (p.id === id ? { ...p, groupId: null } : p))
    );
    setSelectedPhotoIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // ── Step 2: Grouping ─────────────────────────────────────────────────────────

  const togglePhotoSelect = (id: string) => {
    if (!groupingMode) return;
    setSelectedPhotoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createGroup = () => {
    if (selectedPhotoIds.size < 2) {
      toast.error(t("bulkUpload.selectAtLeast2"));
      return;
    }
    const label = GROUP_LABELS[groups.length] ?? `${groups.length + 1}`;
    const newGroup: Group = { id: `group-${Date.now()}`, label };
    setGroups(prev => [...prev, newGroup]);
    setPhotos(prev =>
      prev.map(p =>
        selectedPhotoIds.has(p.id) ? { ...p, groupId: newGroup.id } : p
      )
    );
    setSelectedPhotoIds(new Set());
    toast.success(
      `Group ${label} with ${selectedPhotoIds.size} photos created`
    );
  };

  const ungroup = (groupId: string) => {
    setPhotos(prev =>
      prev.map(p => (p.groupId === groupId ? { ...p, groupId: null } : p))
    );
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  // ── Step 3: AI Analysis + Match Finding ─────────────────────────────────────

  const buildReviewGroups = (): Array<{
    groupId: string;
    photoIds: string[];
  }> => {
    const result: Array<{ groupId: string; photoIds: string[] }> = [];
    for (const group of groups) {
      const groupPhotos = photos.filter(p => p.groupId === group.id);
      if (groupPhotos.length > 0) {
        result.push({
          groupId: group.id,
          photoIds: groupPhotos.map(p => p.id),
        });
      }
    }
    for (const photo of photos) {
      if (!photo.groupId) {
        result.push({ groupId: photo.id, photoIds: [photo.id] });
      }
    }
    return result;
  };

  const runAnalysis = async () => {
    const reviewGroups = buildReviewGroups();
    if (reviewGroups.length === 0) {
      toast.error("No photos to analyse");
      return;
    }

    setAnalyzing(true);
    setFindingMatches(true);
    setStep(3);

    try {
      const groups_input = reviewGroups.map(rg => ({
        groupId: rg.groupId,
        images: rg.photoIds.map(pid => {
          const photo = photos.find(p => p.id === pid)!;
          return { data: photo.dataUrl, mimeType: photo.mimeType };
        }),
      }));

      const results = await bulkAnalyzeMutation.mutateAsync({
        groups: groups_input,
      });

      const cards: ReviewCard[] = reviewGroups.map(rg => {
        const aiResult = results.find(r => r.groupId === rg.groupId);
        return {
          groupId: rg.groupId,
          photoIds: rg.photoIds,
          name: aiResult?.name ?? "Schmuckstück",
          nameEn: aiResult?.nameEn ?? "Jewelry Piece",
          description: aiResult?.description ?? "Handgefertigtes Schmuckstück.",
          descriptionEn:
            aiResult?.descriptionEn ?? "Handcrafted jewelry piece.",
          category: (aiResult?.category as ProductCategory) ?? "Other",
          price: "",
          confirmed: true,
          aiSuccess: aiResult?.success ?? false,
        };
      });

      setReviewCards(cards);

      // ── Auto-run findMatches after AI analysis ──
      const matchInput = cards.map(card => ({
        tempId: card.groupId,
        name: card.name,
        description: card.description,
        category: card.category,
      }));

      try {
        const matchResult = await findMatchesMutation.mutateAsync({
          items: matchInput,
        });
        setMatches(matchResult.matches);

        // Default decisions: exact matches → add-to-existing, no match → create-new
        const decisions = new Map<string, MatchDecision>();
        for (const m of matchResult.matches) {
          if (m.confidence === "exact" && m.matchedProductId) {
            decisions.set(m.tempId, {
              action: "add-to-existing",
              updateDescription: false,
            });
          } else {
            decisions.set(m.tempId, {
              action: "create-new",
              updateDescription: false,
            });
          }
        }
        setMatchDecisions(decisions);

        const matchCount = matchResult.matches.filter(
          m => m.confidence !== "none"
        ).length;
        if (matchCount > 0) {
          toast.success(
            `${matchCount} of ${cards.length} products found in inventory`
          );
        }
      } catch (err) {
        console.error("[findMatches] Failed:", err);
        // Non-fatal: just default all to create-new
        const decisions = new Map<string, MatchDecision>();
        for (const card of cards) {
          decisions.set(card.groupId, {
            action: "create-new",
            updateDescription: false,
          });
        }
        setMatchDecisions(decisions);
      }
    } catch {
      toast.error(
        "AI analysis failed. You can enter details manually."
      );
      const reviewGroups2 = buildReviewGroups();
      setReviewCards(
        reviewGroups2.map(rg => ({
          groupId: rg.groupId,
          photoIds: rg.photoIds,
          name: "Schmuckstück",
          nameEn: "Jewelry Piece",
          description: "Handgefertigtes Schmuckstück.",
          descriptionEn: "Handcrafted jewelry piece.",
          category: "Other" as ProductCategory,
          price: "",
          confirmed: true,
          aiSuccess: false,
        }))
      );
    } finally {
      setAnalyzing(false);
      setFindingMatches(false);
    }
  };

  const updateCard = (
    groupId: string,
    field: keyof ReviewCard,
    value: unknown
  ) => {
    setReviewCards(prev =>
      prev.map(c => (c.groupId === groupId ? { ...c, [field]: value } : c))
    );
  };

  const getMatchForCard = (groupId: string): MatchResult | undefined => {
    return matches.find(m => m.tempId === groupId);
  };

  const getDecisionForCard = (groupId: string): MatchDecision => {
    return (
      matchDecisions.get(groupId) ?? {
        action: "create-new",
        updateDescription: false,
      }
    );
  };

  const setDecision = (groupId: string, decision: MatchDecision) => {
    setMatchDecisions(prev => {
      const next = new Map(prev);
      next.set(groupId, decision);
      return next;
    });
  };

  // ── Step 4: Publish ──────────────────────────────────────────────────────────

  const handlePublish = async () => {
    const confirmed = reviewCards.filter(c => c.confirmed);

    // Separate into "add to existing" and "create new"
    const toUpsert: Array<{
      card: ReviewCard;
      match: MatchResult;
      decision: MatchDecision;
    }> = [];
    const toCreate: ReviewCard[] = [];

    for (const card of confirmed) {
      const match = getMatchForCard(card.groupId);
      const decision = getDecisionForCard(card.groupId);

      if (
        decision.action === "add-to-existing" &&
        match?.matchedProductId
      ) {
        toUpsert.push({ card, match, decision });
      } else {
        // Validate price for new items
        if (
          !card.price ||
          Number.isNaN(parseFloat(card.price)) ||
          parseFloat(card.price) <= 0
        ) {
          toast.error(
            `Please set a valid price for: ${card.name}`
          );
          return;
        }
        toCreate.push(card);
      }
    }

    if (toUpsert.length === 0 && toCreate.length === 0) {
      toast.error("No products selected for publishing");
      return;
    }

    setPublishing(true);

    try {
      let createdCount = 0;
      let updatedCount = 0;
      const allFailed: string[] = [];
      const allWarnings: string[] = [];

      // ── Upsert images to existing products ──
      if (toUpsert.length > 0) {
        const upsertItems = toUpsert.map(({ card, match, decision }) => ({
          productId: match.matchedProductId!,
          images: card.photoIds.map(pid => {
            const photo = photos.find(p => p.id === pid)!;
            return { data: photo.dataUrl, mimeType: photo.mimeType };
          }),
          description: card.description,
          descriptionEn: card.descriptionEn,
          updateDescription: decision.updateDescription,
        }));

        try {
          const upsertResult =
            await bulkUpsertImagesMutation.mutateAsync({
              items: upsertItems,
            });
          updatedCount += upsertResult.updated;
          allFailed.push(...upsertResult.failed);
          if (upsertResult.extraImageWarnings) {
            allWarnings.push(...upsertResult.extraImageWarnings);
          }
        } catch (err) {
          console.error("[bulkUpsertImages] failed:", err);
          allFailed.push(
            ...toUpsert.map(u => u.match.matchedProductName ?? "unknown")
          );
        }
      }

      // ── Create new products ──
      if (toCreate.length > 0) {
        const productsToCreate = toCreate.map(card => ({
          name: card.name,
          nameEn: card.nameEn || undefined,
          description: card.description,
          descriptionEn: card.descriptionEn || undefined,
          price: parseFloat(card.price),
          category: card.category,
          images: card.photoIds.map(pid => {
            const photo = photos.find(p => p.id === pid)!;
            return { data: photo.dataUrl, mimeType: photo.mimeType };
          }),
        }));

        try {
          const createResult = await bulkCreateMutation.mutateAsync({
            products: productsToCreate,
          });
          createdCount += createResult.created;
          allFailed.push(...createResult.failed);
          if (createResult.extraImageWarnings) {
            allWarnings.push(...createResult.extraImageWarnings);
          }
        } catch (err) {
          console.error("[bulkCreate] failed:", err);
          allFailed.push(...toCreate.map(c => c.name));
        }
      }

      setPublishResult({
        created: createdCount,
        updated: updatedCount,
        failed: allFailed,
        extraImageWarnings: allWarnings,
      });
      setStep(4);
      utils.products.list.invalidate();
      utils.products.adminList.invalidate();
    } catch {
      toast.error(
        "Publishing failed. Please try again."
      );
    } finally {
      setPublishing(false);
    }
  };

  const resetAll = () => {
    setStep(1);
    setPhotos([]);
    setGroups([]);
    setSelectedPhotoIds(new Set());
    setGroupingMode(false);
    setReviewCards([]);
    setMatches([]);
    setMatchDecisions(new Map());
    setPublishResult(null);
  };

  // ── Auth guard ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="animate-spin text-[var(--brand-ink)]" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            {t("bulkUpload.adminRequired")}
          </h2>
          <a
            href={getLoginUrl()}
            className="inline-flex items-center gap-2 bg-[var(--brand-ink)] text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
          >
            {t("bulkUpload.signIn")}
          </a>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            {t("bulkUpload.accessDenied")}
          </h2>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter pt-20 min-h-screen bg-[var(--brand-surface)]">
      {/* Header */}
      <section className="bg-[var(--brand-ink)] py-10">
        <div className="container flex items-center justify-between">
          <div>
            <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-1 font-sans">
              {t("bulkUpload.adminBadge")}
            </p>
            <h1 className="font-serif text-white text-2xl">
              {t("bulkUpload.title")}
            </h1>
            <p className="text-white/50 text-xs font-sans mt-1">
              {t("bulkUpload.subtitle")}
            </p>
          </div>
          <Link
            href="/admin"
            className="text-white/60 hover:text-white text-xs uppercase tracking-[0.15em] font-sans transition-colors"
          >
            {t("bulkUpload.backToAdmin")}
          </Link>
        </div>
      </section>

      <div className="container py-8 max-w-4xl">
        <StepBar step={step} />

        {/* ── STEP 1: Select Photos ── */}
        {step === 1 && (
          <div>
            <div className="mb-6">
              <h2 className="font-serif text-foreground text-xl mb-1">
                {t("bulkUpload.selectTitle")}
              </h2>
              <p className="text-muted-foreground text-sm font-sans">
                {t("bulkUpload.selectSubtitle")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-[var(--brand-ink)]/30 hover:border-[var(--brand-accent)] transition-colors p-10 text-center mb-6 group"
            >
              <Upload
                size={32}
                className="mx-auto mb-3 text-[var(--brand-ink)]/40 group-hover:text-[var(--brand-accent)] transition-colors"
              />
              <p className="font-serif text-foreground text-lg mb-1">
                {t("bulkUpload.tapToSelect")}
              </p>
              <p className="text-muted-foreground text-xs font-sans">
                {t("bulkUpload.fileHint")}
              </p>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {photos.length > 0 && (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-6">
                  {photos.map(photo => (
                    <div
                      key={photo.id}
                      className="relative aspect-square group"
                    >
                      <img
                        src={photo.dataUrl}
                        alt={photo.fileName}
                        className="w-full h-full object-cover bg-[#E8E0D4]"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-[var(--brand-ink)]/20 hover:border-[var(--brand-accent)] flex items-center justify-center transition-colors"
                  >
                    <Upload size={20} className="text-muted-foreground" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground font-sans">
                    {t("bulkUpload.photosSelected", { count: photos.length })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center gap-2 bg-[var(--brand-ink)] text-white px-6 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
                  >
                    {t("bulkUpload.nextGroup")}
                    <ChevronRight size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 2: Group Photos ── */}
        {step === 2 && (
          <div>
            <div className="mb-6">
              <h2 className="font-serif text-foreground text-xl mb-1">
                {t("bulkUpload.groupTitle")}
              </h2>
              <p
                className="text-muted-foreground text-sm font-sans"
                dangerouslySetInnerHTML={{
                  __html: t("bulkUpload.groupSubtitle"),
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3 mb-5">
              <button
                type="button"
                onClick={() => {
                  setGroupingMode(v => !v);
                  setSelectedPhotoIds(new Set());
                }}
                className={`flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.12em] font-sans transition-colors ${
                  groupingMode
                    ? "bg-[var(--brand-accent)] text-[var(--brand-ink)]"
                    : "bg-white border border-[var(--brand-ink)]/20 text-foreground hover:border-[var(--brand-accent)]"
                }`}
              >
                <Layers size={14} />
                {groupingMode
                  ? t("bulkUpload.groupModeOn")
                  : t("bulkUpload.groupMode")}
              </button>

              {groupingMode && selectedPhotoIds.size >= 2 && (
                <button
                  type="button"
                  onClick={createGroup}
                  className="flex items-center gap-2 bg-[var(--brand-ink)] text-white px-4 py-2 text-xs uppercase tracking-[0.12em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
                >
                  <Layers size={14} />
                  {t("bulkUpload.createGroup", {
                    count: selectedPhotoIds.size,
                  })}
                </button>
              )}

              {groupingMode &&
                selectedPhotoIds.size > 0 &&
                selectedPhotoIds.size < 2 && (
                  <p className="text-xs text-muted-foreground font-sans self-center">
                    {t("bulkUpload.selectAtLeast2")}
                  </p>
                )}
            </div>

            {groups.length > 0 && (
              <div className="mb-6 space-y-3">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">
                  {t("bulkUpload.groups", { count: groups.length })}
                </p>
                {groups.map(group => {
                  const groupPhotos = photos.filter(
                    p => p.groupId === group.id
                  );
                  return (
                    <div
                      key={group.id}
                      className="bg-white border border-[var(--brand-border)] p-3 flex items-center gap-3"
                    >
                      <div className="w-7 h-7 bg-[var(--brand-ink)] text-white flex items-center justify-center text-xs font-bold font-sans flex-shrink-0">
                        {group.label}
                      </div>
                      <div className="flex gap-1.5 flex-1 overflow-x-auto">
                        {groupPhotos.map(p => (
                          <img
                            key={p.id}
                            src={p.dataUrl}
                            alt=""
                            className="w-12 h-12 object-cover flex-shrink-0"
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground font-sans flex-shrink-0">
                        {t("bulkUpload.photos", { count: groupPhotos.length })}
                      </p>
                      <button
                        type="button"
                        onClick={() => ungroup(group.id)}
                        title="Ungroup"
                        className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors flex-shrink-0"
                      >
                        <Ungroup size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-6">
              {photos.map(photo => {
                const group = photo.groupId
                  ? groups.find(g => g.id === photo.groupId)
                  : null;
                const isSelected = selectedPhotoIds.has(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => togglePhotoSelect(photo.id)}
                    className={`relative aspect-square cursor-pointer block w-full p-0 border-0 bg-transparent ${
                      groupingMode ? "hover:opacity-80" : ""
                    }`}
                  >
                    <img
                      src={photo.dataUrl}
                      alt={photo.fileName}
                      className={`w-full h-full object-cover bg-[#E8E0D4] transition-all ${
                        isSelected
                          ? "ring-2 ring-[var(--brand-accent)] ring-offset-1"
                          : ""
                      } ${group ? "opacity-70" : ""}`}
                    />
                    {group && (
                      <div className="absolute top-1 left-1 w-5 h-5 bg-[var(--brand-ink)] text-white flex items-center justify-center text-[9px] font-bold font-sans">
                        {group.label}
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 bg-[var(--brand-accent)]/20 flex items-center justify-center">
                        <CheckCircle2 size={24} className="text-[var(--brand-accent)]" />
                      </div>
                    )}
                    {!group && !isSelected && (
                      <div className="absolute bottom-1 right-1 bg-black/40 text-white text-[8px] px-1 font-sans">
                        {t("bulkUpload.solo")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="bg-white border border-[var(--brand-border)] p-4 mb-6 text-sm font-sans">
              <p
                className="text-foreground font-medium mb-1"
                dangerouslySetInnerHTML={{
                  __html: t("bulkUpload.willCreate", {
                    count:
                      groups.length + photos.filter(p => !p.groupId).length,
                  }),
                }}
              />
              <p className="text-muted-foreground text-xs">
                {groups.length > 0 &&
                  `${t("bulkUpload.groupedProducts", { count: groups.length })} · `}
                {t("bulkUpload.soloPhotos", {
                  count: photos.filter(p => !p.groupId).length,
                })}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-2 border border-[var(--brand-ink)]/20 text-foreground px-5 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:border-[var(--brand-ink)] transition-colors"
              >
                <ChevronLeft size={16} />
                {t("bulkUpload.back")}
              </button>
              <button
                type="button"
                onClick={runAnalysis}
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-ink)] text-white px-6 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
              >
                <Sparkles size={16} />
                {t("bulkUpload.analyseAI")}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: AI Review + Inventory Match ── */}
        {step === 3 && (
          <div>
            <div className="mb-6">
              <h2 className="font-serif text-foreground text-xl mb-1">
                {t("bulkUpload.reviewTitle")}
              </h2>
              <p className="text-muted-foreground text-sm font-sans">
                {findingMatches
                  ? "Checking inventory..."
                  : matches.some(m => m.confidence !== "none")
                    ? "Matches found with existing inventory are shown below."
                    : t("bulkUpload.reviewSubtitle")}
              </p>
            </div>

            {analyzing || findingMatches ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Sparkles
                  size={36}
                  className={`text-[var(--brand-accent)] ${findingMatches && !analyzing ? "" : "animate-pulse"}`}
                />
                <p className="font-serif text-foreground text-lg">
                  {analyzing
                    ? t("bulkUpload.analysingPhotos")
                    : "Checking inventory..."}
                </p>
                <p className="text-muted-foreground text-sm font-sans">
                  {analyzing
                    ? t("bulkUpload.analysisSub")
                    : "Comparing with existing products..."}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-5 mb-8">
                  {reviewCards.map((card, idx) => {
                    const match = getMatchForCard(card.groupId);
                    const decision = getDecisionForCard(card.groupId);
                    const hasMatch =
                      match && match.confidence !== "none" && match.matchedProductId;

                    return (
                      <div
                        key={card.groupId}
                        className={`bg-white border transition-all ${
                          card.confirmed
                            ? "border-[var(--brand-ink)]/30 shadow-sm"
                            : "border-[var(--brand-border)] opacity-50"
                        }`}
                      >
                        <div className="flex items-center gap-3 p-4 border-b border-[var(--brand-border)]">
                          <div className="flex gap-1.5 flex-shrink-0">
                            {card.photoIds.slice(0, 3).map(pid => {
                              const photo = photos.find(p => p.id === pid);
                              return photo ? (
                                <img
                                  key={pid}
                                  src={photo.dataUrl}
                                  alt=""
                                  className="w-14 h-14 object-cover"
                                />
                              ) : null;
                            })}
                            {card.photoIds.length > 3 && (
                              <div className="w-14 h-14 bg-[#E8E0D4] flex items-center justify-center text-xs text-muted-foreground font-sans">
                                +{card.photoIds.length - 3}
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-sans">
                                {t("bulkUpload.product", { n: idx + 1 })}
                              </span>
                              {card.aiSuccess ? (
                                <span className="flex items-center gap-1 text-[10px] text-green-600 font-sans">
                                  <Sparkles size={10} />
                                  {t("bulkUpload.aiFilledBadge")}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] text-amber-600 font-sans">
                                  <AlertCircle size={10} />
                                  {t("bulkUpload.manualBadge")}
                                </span>
                              )}
                            </div>
                            <p className="font-serif text-foreground truncate">
                              {card.name}
                            </p>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={card.confirmed}
                              onChange={e =>
                                updateCard(
                                  card.groupId,
                                  "confirmed",
                                  e.target.checked
                                )
                              }
                              className="w-4 h-4 accent-[var(--brand-ink)]"
                            />
                            <span className="text-xs font-sans text-muted-foreground">
                              {t("bulkUpload.include")}
                            </span>
                          </label>
                        </div>

                        {/* ── Match banner ── */}
                        {card.confirmed && hasMatch && (
                          <div
                            className={`px-4 py-2.5 border-b border-[var(--brand-border)] ${
                              match.confidence === "exact"
                                ? "bg-green-50"
                                : "bg-amber-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Search
                                  size={14}
                                  className={
                                    match.confidence === "exact"
                                      ? "text-green-600"
                                      : "text-amber-600"
                                  }
                                />
                                <span
                                  className={`text-xs font-sans font-medium ${
                                    match.confidence === "exact"
                                      ? "text-green-700"
                                      : "text-amber-700"
                                  }`}
                                >
                                  {match.confidence === "exact"
                                    ? "Exact match"
                                    : "Similar product"}{" "}
                                  in inventory:{" "}
                                  <span className="font-bold">
                                    {match.matchedProductName}
                                  </span>
                                </span>
                              </div>
                              <span
                                className={`text-[10px] uppercase tracking-wider font-sans px-2 py-0.5 ${
                                  match.confidence === "exact"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {match.confidence}
                              </span>
                            </div>

                            {/* Action toggle */}
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setDecision(card.groupId, {
                                    action: "add-to-existing",
                                    updateDescription:
                                      decision.updateDescription,
                                  })
                                }
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans transition-colors ${
                                  decision.action === "add-to-existing"
                                    ? "bg-[var(--brand-ink)] text-white"
                                    : "bg-white border border-[var(--brand-ink)]/20 text-foreground hover:border-[var(--brand-ink)]"
                                }`}
                              >
                                <Merge size={12} />
                                Add to existing
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDecision(card.groupId, {
                                    action: "create-new",
                                    updateDescription: false,
                                  })
                                }
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans transition-colors ${
                                  decision.action === "create-new"
                                    ? "bg-[var(--brand-ink)] text-white"
                                    : "bg-white border border-[var(--brand-ink)]/20 text-foreground hover:border-[var(--brand-ink)]"
                                }`}
                              >
                                <PlusCircle size={12} />
                                Create as new
                              </button>
                            </div>

                            {/* Description update toggle */}
                            {decision.action === "add-to-existing" && (
                              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={decision.updateDescription}
                                  onChange={e =>
                                    setDecision(card.groupId, {
                                      action: "add-to-existing",
                                      updateDescription: e.target.checked,
                                    })
                                  }
                                  className="w-3.5 h-3.5 accent-[var(--brand-ink)]"
                                />
                                <span className="text-xs font-sans text-muted-foreground">
                                  Also update description
                                </span>
                              </label>
                            )}
                          </div>
                        )}

                        {card.confirmed && (
                          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Name DE */}
                            <div>
                              <label
                                htmlFor={`bulk-name-${card.groupId}`}
                                className="block text-xs uppercase tracking-[0.12em] text-foreground font-sans mb-1.5"
                              >
                                {t("bulkUpload.fieldNameDe")}{" "}
                                <span className="text-[var(--brand-accent)]">*</span>
                              </label>
                              <input
                                id={`bulk-name-${card.groupId}`}
                                type="text"
                                value={card.name}
                                onChange={e =>
                                  updateCard(
                                    card.groupId,
                                    "name",
                                    e.target.value
                                  )
                                }
                                className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
                              />
                            </div>

                            {/* Name EN */}
                            <div>
                              <label
                                htmlFor={`bulk-nameEn-${card.groupId}`}
                                className="block text-xs uppercase tracking-[0.12em] text-foreground font-sans mb-1.5"
                              >
                                {t("bulkUpload.fieldNameEn")}{" "}
                                <span className="text-[var(--brand-accent)]">*</span>
                              </label>
                              <input
                                id={`bulk-nameEn-${card.groupId}`}
                                type="text"
                                value={card.nameEn}
                                onChange={e =>
                                  updateCard(
                                    card.groupId,
                                    "nameEn",
                                    e.target.value
                                  )
                                }
                                className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`bulk-category-${card.groupId}`}
                                className="block text-xs uppercase tracking-[0.12em] text-foreground font-sans mb-1.5"
                              >
                                {t("bulkUpload.fieldCategory")}{" "}
                                <span className="text-[var(--brand-accent)]">*</span>
                              </label>
                              <select
                                id={`bulk-category-${card.groupId}`}
                                value={card.category}
                                onChange={e =>
                                  updateCard(
                                    card.groupId,
                                    "category",
                                    e.target.value as ProductCategory
                                  )
                                }
                                className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-white"
                              >
                                {CATEGORIES.map(c => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label
                                htmlFor={`bulk-price-${card.groupId}`}
                                className="block text-xs uppercase tracking-[0.12em] text-foreground font-sans mb-1.5"
                              >
                                {t("bulkUpload.fieldPrice")}{" "}
                                <span className="text-[var(--brand-accent)]">*</span>
                              </label>
                              <input
                                id={`bulk-price-${card.groupId}`}
                                type="number"
                                step="0.01"
                                min="0"
                                value={card.price}
                                onChange={e =>
                                  updateCard(
                                    card.groupId,
                                    "price",
                                    e.target.value
                                  )
                                }
                                placeholder={t("bulkUpload.pricePlaceholder")}
                                className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
                              />
                            </div>

                            {/* Description DE */}
                            <div>
                              <label
                                htmlFor={`bulk-description-${card.groupId}`}
                                className="block text-xs uppercase tracking-[0.12em] text-foreground font-sans mb-1.5"
                              >
                                {t("bulkUpload.fieldDescriptionDe")}{" "}
                                <span className="text-[var(--brand-accent)]">*</span>
                              </label>
                              <textarea
                                id={`bulk-description-${card.groupId}`}
                                value={card.description}
                                onChange={e =>
                                  updateCard(
                                    card.groupId,
                                    "description",
                                    e.target.value
                                  )
                                }
                                rows={3}
                                className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent resize-none"
                              />
                            </div>

                            {/* Description EN */}
                            <div>
                              <label
                                htmlFor={`bulk-descriptionEn-${card.groupId}`}
                                className="block text-xs uppercase tracking-[0.12em] text-foreground font-sans mb-1.5"
                              >
                                {t("bulkUpload.fieldDescriptionEn")}{" "}
                                <span className="text-[var(--brand-accent)]">*</span>
                              </label>
                              <textarea
                                id={`bulk-descriptionEn-${card.groupId}`}
                                value={card.descriptionEn}
                                onChange={e =>
                                  updateCard(
                                    card.groupId,
                                    "descriptionEn",
                                    e.target.value
                                  )
                                }
                                rows={3}
                                className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent resize-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="bg-[var(--brand-ink)]/5 border border-[var(--brand-ink)]/10 p-4 mb-6 flex items-center justify-between">
                  <div>
                    <p
                      className="text-sm font-sans text-foreground"
                      dangerouslySetInnerHTML={{
                        __html: t("bulkUpload.selectedForPublish", {
                          confirmed: reviewCards.filter(c => c.confirmed)
                            .length,
                          total: reviewCards.length,
                        }),
                      }}
                    />
                    {(() => {
                      const newItems = reviewCards.filter(c => {
                        if (!c.confirmed) return false;
                        const d = getDecisionForCard(c.groupId);
                        const m = getMatchForCard(c.groupId);
                        return (
                          d.action === "create-new" || !m?.matchedProductId
                        );
                      });
                      const existingItems = reviewCards.filter(c => {
                        if (!c.confirmed) return false;
                        const d = getDecisionForCard(c.groupId);
                        const m = getMatchForCard(c.groupId);
                        return (
                          d.action === "add-to-existing" && m?.matchedProductId
                        );
                      });
                      return (
                        <p className="text-xs text-muted-foreground font-sans mt-0.5">
                          {newItems.length > 0 &&
                            `${newItems.length} create new`}
                          {newItems.length > 0 && existingItems.length > 0
                            ? " · "
                            : ""}
                          {existingItems.length > 0 &&
                            `${existingItems.length} add to existing`}
                        </p>
                      );
                    })()}
                    {reviewCards
                      .filter(c => {
                        if (!c.confirmed) return false;
                        const d = getDecisionForCard(c.groupId);
                        const m = getMatchForCard(c.groupId);
                        return (
                          d.action === "create-new" || !m?.matchedProductId
                        );
                      })
                      .filter(
                        c =>
                          !c.price ||
                          Number.isNaN(parseFloat(c.price)) ||
                          parseFloat(c.price) <= 0
                      ).length > 0 && (
                      <p className="text-xs text-amber-600 font-sans mt-0.5">
                        {t("bulkUpload.needsPrice", {
                          count: reviewCards.filter(c => {
                            if (!c.confirmed) return false;
                            const d = getDecisionForCard(c.groupId);
                            const m = getMatchForCard(c.groupId);
                            return (
                              d.action === "create-new" ||
                              !m?.matchedProductId
                            );
                          }).filter(
                            c =>
                              !c.price ||
                              Number.isNaN(parseFloat(c.price)) ||
                              parseFloat(c.price) <= 0
                          ).length,
                        })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center gap-2 border border-[var(--brand-ink)]/20 text-foreground px-5 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:border-[var(--brand-ink)] transition-colors"
                  >
                    <ChevronLeft size={16} />
                    {t("bulkUpload.back")}
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={
                      publishing ||
                      reviewCards.filter(c => c.confirmed).length === 0
                    }
                    className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-accent)] text-[var(--brand-ink)] px-6 py-3 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:bg-[var(--brand-accent-light)] transition-colors disabled:opacity-60"
                  >
                    {publishing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ShoppingBag size={16} />
                    )}
                    {t("bulkUpload.publishButton", {
                      count: reviewCards.filter(c => c.confirmed).length,
                    })}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 4: Done ── */}
        {step === 4 && publishResult && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-[var(--brand-ink)] rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} className="text-[var(--brand-accent)]" />
            </div>
            <h2 className="font-serif text-foreground text-3xl mb-3">
              {t("bulkUpload.published", {
                count: publishResult.created + publishResult.updated,
              })}
            </h2>
            <p className="text-muted-foreground font-sans mb-2">
              {publishResult.created > 0 &&
                `${publishResult.created} created`}
              {publishResult.created > 0 && publishResult.updated > 0
                ? " · "
                : ""}
              {publishResult.updated > 0 &&
                `${publishResult.updated} updated with new images`}
            </p>
            {publishResult.failed.length > 0 && (
              <p className="text-amber-600 text-sm font-sans mb-4">
                {t("bulkUpload.failedProducts", {
                  count: publishResult.failed.length,
                  names: publishResult.failed.join(", "),
                })}
              </p>
            )}
            {(publishResult.extraImageWarnings?.length ?? 0) > 0 && (
              <p className="text-amber-500 text-sm font-sans mb-4">
                {t("bulkUpload.extraImageWarning")}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center justify-center gap-2 bg-[var(--brand-ink)] text-white px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
              >
                <Upload size={16} />
                {t("bulkUpload.uploadMore")}
              </button>
              <Link
                href="/shop"
                className="flex items-center justify-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-white transition-colors"
              >
                <ImageIcon size={16} />
                {t("bulkUpload.viewShop")}
              </Link>
              <Link
                href="/admin"
                className="flex items-center justify-center gap-2 border border-[var(--brand-ink)]/20 text-foreground px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:border-[var(--brand-ink)] transition-colors"
              >
                {t("bulkUpload.adminPanel")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
