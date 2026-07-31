import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { resolveConnectPrompt } from "@/lib/connectPrompt";
import {
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Loader2,
  Instagram,
  AlertTriangle,
  Pencil,
  Check,
  X,
  FileSpreadsheet,
  Languages,
  TrendingUp,
  ShieldAlert,
  RefreshCw,
  Lightbulb,
  BarChart3,
  AlertCircle,
  Tag,
  Copy,
  CreditCard,
  Receipt,
  CheckCircle2,
  Camera,
} from "lucide-react";
import { getLoginUrl } from "@/const";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@shared/types";
import ProductImageManager from "@/components/ProductImageManager";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import InsightsCard from "@/components/InsightsCard";
import InstagramManager from "@/components/InstagramManager";
import BulkChangeReviewDialog from "@/components/BulkChangeReviewDialog";
import ProductDiscoveryControls, {
  type SortOption,
  type ViewMode,
} from "@/components/ProductDiscoveryControls";
import ProductCategoryGroup from "@/components/ProductCategoryGroup";
import { Link } from "wouter";
import { HelpCircle } from "lucide-react";
import GuidedTour from "@/components/GuidedTour";
import { ADMIN_TOUR_ID, ADMIN_TOUR_STEPS } from "@/lib/adminTour";
import { clearTourCompletion } from "@/lib/tour";
import CapabilityBand from "@/components/CapabilityBand";
import { SketchUnderline } from "@/components/SketchAccents";

const CATEGORIES: readonly ProductCategory[] = PRODUCT_CATEGORIES;

const CATEGORY_COLORS: Record<string, string> = {
  Necklaces: "bg-[#F5EFE8] text-[#8B6914]",
  Earrings: "bg-[#E8E8E8] text-[#555]",
  Rings: "bg-[#E8F4EC] text-[#2D6B4A]",
  Bracelets: "bg-[#EEE8F5] text-[#5A2D82]",
  Bangles: "bg-[#F5E8E8] text-[#8B2020]",
  Anklets: "bg-[#E8F0E8] text-[#2D4A20]",
  Brooches: "bg-[#FFF0DC] text-[#8B5914]",
  "Hair Accessories": "bg-[#E8EEF5] text-[#1A3D6B]",
  Other: "bg-[#EEEEEE] text-[#666]",
};

interface AddForm {
  name: string;
  description: string;
  price: string;
  category: ProductCategory;
  imageUrl: string;
  quantity: string;
}

const EMPTY_FORM: AddForm = {
  name: "",
  description: "",
  price: "",
  category: "Other",
  imageUrl: "",
  quantity: "1",
};

interface EditForm {
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  price: string;
  category: ProductCategory;
}

// ─── Product Row ──────────────────────────────────────────────────────────────

interface ProductRowProps {
  product: {
    id: number;
    name: string;
    nameEn: string | null;
    description: string;
    descriptionEn: string | null;
    price: string;
    category: string;
    imageUrl: string | null;
    visible: boolean;
    sold: boolean;
    quantity: number;
    source: string;
  };
  onRefetch: () => void;
}

function ProductRow({ product, onRefetch }: ProductRowProps) {
  const [qtyValue, setQtyValue] = useState(String(product.quantity));
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: product.name,
    nameEn: product.nameEn ?? "",
    description: product.description,
    descriptionEn: product.descriptionEn ?? "",
    price: String(Number(product.price).toFixed(2)),
    category: product.category as ProductCategory,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setQtyValue(String(product.quantity));
  }, [product.quantity]);

  const qtyMutation = trpc.products.setQuantity.useMutation({
    onSuccess: onRefetch,
    onError: () => toast.error("Failed to update quantity"),
  });

  const toggleMutation = trpc.products.toggleVisibility.useMutation({
    onSuccess: onRefetch,
    onError: () => toast.error("Failed to update visibility"),
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      onRefetch();
      toast.success("Product deleted");
    },
    onError: () => toast.error("Failed to delete product"),
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      onRefetch();
      setEditing(false);
      toast.success("Product updated");
    },
    onError: () => toast.error("Failed to update product"),
  });

  const commitQty = () => {
    const n = parseInt(qtyValue, 10);
    if (Number.isNaN(n) || n < 0) {
      setQtyValue(String(product.quantity));
      return;
    }
    if (n === product.quantity) return;
    qtyMutation.mutate({ id: product.id, quantity: n });
  };

  const handleSaveEdit = () => {
    const price = parseFloat(editForm.price);
    if (!editForm.name.trim() || !editForm.description.trim()) {
      toast.error("Name and description are required");
      return;
    }
    if (Number.isNaN(price) || price <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    updateMutation.mutate({
      id: product.id,
      name: editForm.name.trim(),
      nameEn: editForm.nameEn.trim() || null,
      description: editForm.description.trim(),
      descriptionEn: editForm.descriptionEn.trim() || null,
      price,
      category: editForm.category,
    });
  };

  const startEdit = () => {
    setEditForm({
      name: product.name,
      nameEn: product.nameEn ?? "",
      description: product.description,
      descriptionEn: product.descriptionEn ?? "",
      price: String(Number(product.price).toFixed(2)),
      category: product.category as ProductCategory,
    });
    setEditing(true);
  };

  const isBusy =
    qtyMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending ||
    updateMutation.isPending;

  return (
    <>
      <tr
        className={`border-b border-[var(--brand-border)] last:border-0 transition-colors hover:bg-[var(--brand-surface-2)] ${!product.visible ? "opacity-50" : ""}`}
      >
        {/* Product */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-10 h-10 object-cover flex-shrink-0 bg-[var(--brand-surface-3)]"
              />
            ) : (
              <div className="w-10 h-10 bg-[var(--brand-surface-3)] flex items-center justify-center flex-shrink-0">
                <span className="text-[var(--brand-accent)]/40 font-serif">
                  ◇
                </span>
              </div>
            )}
            <div>
              <p className="font-serif text-foreground text-sm">
                {product.name}
              </p>
              {product.nameEn && (
                <p className="text-muted-foreground text-xs font-sans">
                  {product.nameEn}
                </p>
              )}
              <ProductImageManager
                productId={product.id}
                productName={product.name}
              />
            </div>
          </div>
        </td>

        {/* Category */}
        <td className="px-4 py-4 hidden md:table-cell">
          <span
            className={`text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 font-sans ${CATEGORY_COLORS[product.category] ?? ""}`}
          >
            {product.category}
          </span>
        </td>

        {/* Price */}
        <td className="px-4 py-4">
          <span className="font-serif text-[var(--brand-ink)] text-sm">
            CHF {Number(product.price).toFixed(2)}
          </span>
        </td>

        {/* Qty */}
        <td className="px-4 py-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const n = Math.max(0, (parseInt(qtyValue, 10) || 0) - 1);
                setQtyValue(String(n));
                qtyMutation.mutate({ id: product.id, quantity: n });
              }}
              disabled={isBusy || parseInt(qtyValue, 10) <= 0}
              className="w-6 h-6 flex items-center justify-center border border-[var(--brand-ink)]/20 text-muted-foreground hover:border-[var(--brand-ink)] hover:text-foreground transition-colors disabled:opacity-30 text-sm leading-none"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              value={qtyValue}
              onChange={(e) => setQtyValue(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-10 text-center text-sm font-sans border border-[var(--brand-ink)]/20 py-0.5 focus:outline-none focus:border-[var(--brand-accent)] bg-transparent"
            />
            <button
              type="button"
              onClick={() => {
                const n = (parseInt(qtyValue, 10) || 0) + 1;
                setQtyValue(String(n));
                qtyMutation.mutate({ id: product.id, quantity: n });
              }}
              disabled={isBusy}
              className="w-6 h-6 flex items-center justify-center border border-[var(--brand-ink)]/20 text-muted-foreground hover:border-[var(--brand-ink)] hover:text-foreground transition-colors disabled:opacity-30 text-sm leading-none"
            >
              +
            </button>
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-4 hidden sm:table-cell">
          <span
            className={`text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 font-sans ${product.visible ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
          >
            {product.visible ? "Visible" : "Hidden"}
          </span>
        </td>

        {/* Actions */}
        <td className="px-6 py-4">
          <div className="flex items-center justify-end gap-1">
            {/* Edit */}
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : startEdit())}
              title={editing ? "Cancel edit" : "Edit product"}
              className={`p-2 transition-colors ${editing ? "text-[var(--brand-accent)]" : "text-muted-foreground hover:text-[var(--brand-ink)]"}`}
            >
              <Pencil size={15} />
            </button>

            {/* Toggle visibility */}
            <button
              type="button"
              onClick={() =>
                toggleMutation.mutate({
                  id: product.id,
                  visible: !product.visible,
                })
              }
              disabled={isBusy}
              title={product.visible ? "Hide product" : "Show product"}
              className="p-2 text-muted-foreground hover:text-[var(--brand-ink)] transition-colors disabled:opacity-40"
            >
              {toggleMutation.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : product.visible ? (
                <EyeOff size={15} />
              ) : (
                <Eye size={15} />
              )}
            </button>

            {/* Delete */}
            {confirmingDelete ? (
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDelete(false);
                    deleteMutation.mutate({ id: product.id });
                  }}
                  disabled={deleteMutation.isPending}
                  className="px-2 py-1 text-[11px] uppercase tracking-wide font-sans text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  Del
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-2 py-1 text-[11px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={isBusy}
                title="Delete product"
                className="p-2 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40"
              >
                {deleteMutation.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Inline edit row */}
      {editing && (
        <tr className="border-b border-[var(--brand-border)] bg-[var(--brand-surface-2)]">
          <td colSpan={6} className="px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label
                  htmlFor={`edit-name-${product.id}`}
                  className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
                >
                  Name (DE) *
                </label>
                <input
                  id={`edit-name-${product.id}`}
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-nameEn-${product.id}`}
                  className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
                >
                  Name (EN)
                </label>
                <input
                  id={`edit-nameEn-${product.id}`}
                  type="text"
                  value={editForm.nameEn}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, nameEn: e.target.value }))
                  }
                  className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-price-${product.id}`}
                  className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
                >
                  Price (CHF) *
                </label>
                <input
                  id={`edit-price-${product.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, price: e.target.value }))
                  }
                  className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-category-${product.id}`}
                  className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
                >
                  Category *
                </label>
                <select
                  id={`edit-category-${product.id}`}
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      category: e.target.value as ProductCategory,
                    }))
                  }
                  className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor={`edit-description-${product.id}`}
                  className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
                >
                  Description (DE) *
                </label>
                <textarea
                  id={`edit-description-${product.id}`}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={3}
                  className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white resize-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-descriptionEn-${product.id}`}
                  className="block text-[10px] uppercase tracking-[0.12em] text-foreground font-sans mb-1"
                >
                  Description (EN)
                </label>
                <textarea
                  id={`edit-descriptionEn-${product.id}`}
                  value={editForm.descriptionEn}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      descriptionEn: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full border border-[var(--brand-ink)]/20 px-3 py-2 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-white resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 bg-[var(--brand-ink)] text-white px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors disabled:opacity-60"
              >
                {updateMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex items-center gap-2 border border-[var(--brand-ink)]/20 text-muted-foreground px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-[var(--brand-ink)] hover:text-foreground transition-colors"
              >
                <X size={13} />
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type DupResult = {
  id: number;
  name: string;
  confidence: string;
  reason: string;
};
type InsightsData = {
  highlights: string[];
  recommendations: string[];
  topCategory: string;
  slowMovers: string[];
};

export default function Admin() {
  const { user, isAuthenticated, loading } = useAuth();
  // Bumping this restarts the guided tour (the "Replay tour" button).
  const [tourSignal, setTourSignal] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORIES.map((c) => c)),
  );

  // Duplicate detection state
  const [dupState, setDupState] = useState<"idle" | "checking" | "found">(
    "idle",
  );
  const [dupResults, setDupResults] = useState<DupResult[]>([]);

  // Insights state
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  const utils = trpc.useUtils();
  const refetch = () => {
    utils.products.adminList.invalidate();
    utils.products.list.invalidate();
  };

  // Stripe Connect: link this store's own Stripe account for storefront
  // checkout (separate from Zolto's own subscription billing).
  const stripeConnectQuery = trpc.tenant.getStripeConnectUrl.useQuery();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("stripeConnect");
    if (!status) return;
    if (status === "success") {
      toast.success("Stripe account connected — online payments are live.");
      utils.tenant.getStripeConnectUrl.invalidate();
    } else if (status === "error") {
      toast.error(
        params.get("reason")
          ? `Stripe connection failed: ${params.get("reason")}`
          : "Stripe connection failed. Please try again.",
      );
    }
    params.delete("stripeConnect");
    params.delete("reason");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, [utils]);

  const handleConnectStripe = () => {
    // Decision logic lives in resolveConnectPrompt so it can be tested: the
    // four outcomes here are easy to conflate, and telling a merchant the
    // platform is broken when the query merely hadn't loaded is a real cost.
    const prompt = resolveConnectPrompt(stripeConnectQuery);
    if (prompt.kind === "redirect") {
      window.location.href = prompt.url;
    } else if (prompt.kind === "pending") {
      toast.info(prompt.message);
    } else {
      toast.error(prompt.message);
    }
  };

  const { data: products, isLoading: productsLoading } =
    trpc.products.adminList.useQuery(undefined, {
      enabled: isAuthenticated && user?.role === "admin",
    });

  // Sorted product list derived from sortBy state
  const sortedProducts = useMemo(() => {
    if (!products) return [];
    const copy = [...products];
    if (sortBy === "name") {
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortBy === "category") {
      return copy.sort((a, b) => {
        const ai = CATEGORIES.indexOf(
          a.category as (typeof CATEGORIES)[number],
        );
        const bi = CATEGORIES.indexOf(
          b.category as (typeof CATEGORIES)[number],
        );
        const catCmp = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        if (catCmp !== 0) return catCmp;
        return a.name.localeCompare(b.name);
      });
    }
    // "newest" — server already returns newest-first, preserve order
    return copy;
  }, [products, sortBy]);

  const { data: bulkLogs, isLoading: bulkLogsLoading } =
    trpc.products.getBulkLogs.useQuery(undefined, {
      enabled: isAuthenticated && user?.role === "admin",
    });

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Product added successfully");
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      setDupState("idle");
      setDupResults([]);
    },
    onError: () => toast.error("Failed to add product"),
  });

  // Auto-translate: preview computes AI suggestions without writing anything;
  // the admin reviews/deselects in a dialog, and only the approved subset is
  // ever sent to applyAutoTranslateAll.
  const [translateProposals, setTranslateProposals] = useState<
    Array<{ id: number; name: string; nameEn: string; descriptionEn: string }>
  >([]);
  const [showTranslateReview, setShowTranslateReview] = useState(false);

  const previewTranslateMutation =
    trpc.products.previewAutoTranslateAll.useMutation({
      onSuccess: (data) => {
        if (data.proposals.length === 0) {
          toast.success("All products already have English translations.");
          return;
        }
        setTranslateProposals(data.proposals);
        setShowTranslateReview(true);
      },
      onError: () =>
        toast.error("Auto-translation preview failed. Please try again."),
    });

  // Storefront locale translation (de/en/fr): fills each product's missing
  // locale fields one product at a time; storefront renders the visitor's
  // locale via client/src/lib/localize.ts and falls back to the primary text.
  const translateLocalesMutation =
    trpc.products.translateProductLocales.useMutation();
  const [translatingLocales, setTranslatingLocales] = useState(false);
  const handleTranslateLocales = async () => {
    if (!products || products.length === 0) return;
    setTranslatingLocales(true);
    let translated = 0;
    try {
      for (const p of products) {
        const r = await translateLocalesMutation.mutateAsync({
          productId: p.id,
        });
        if (!r.skipped) translated += 1;
      }
      refetch();
      toast.success(
        translated > 0
          ? `Translated ${translated} product${translated !== 1 ? "s" : ""} into German, English and French.`
          : "All products already have de/en/fr translations.",
      );
    } catch {
      toast.error("Storefront translation failed. Please try again.");
    } finally {
      setTranslatingLocales(false);
    }
  };

  const applyTranslateMutation =
    trpc.products.applyAutoTranslateAll.useMutation({
      onSuccess: (data) => {
        refetch();
        setShowTranslateReview(false);
        toast.success(
          `${data.updated} product${data.updated !== 1 ? "s" : ""} translated to English.`,
        );
      },
      onError: () => toast.error("Auto-translation failed. Please try again."),
    });

  // Re-categorise: same preview → review → apply shape as auto-translate.
  const [recategorizeProposals, setRecategorizeProposals] = useState<
    Array<{ id: number; name: string; from: string; to: string }>
  >([]);
  const [showRecategorizeReview, setShowRecategorizeReview] = useState(false);

  const previewRecategoriseMutation =
    trpc.products.previewRecategorizeAll.useMutation({
      onSuccess: (data) => {
        if (data.proposals.length === 0) {
          toast.success("All uncategorised products were already classified.");
          return;
        }
        setRecategorizeProposals(data.proposals);
        setShowRecategorizeReview(true);
      },
      onError: () =>
        toast.error("Re-categorisation preview failed. Please try again."),
    });

  const applyRecategoriseMutation =
    trpc.products.applyRecategorizeAll.useMutation({
      onSuccess: (data) => {
        refetch();
        setShowRecategorizeReview(false);
        toast.success(
          `${data.updated} product${data.updated !== 1 ? "s" : ""} re-categorised by body part.`,
        );
      },
      onError: () => toast.error("Re-categorisation failed. Please try again."),
    });

  const reconciliationMutation = trpc.reconciliation.run.useMutation({
    onSuccess: (data) => {
      if (data.newPendingReview > 0) {
        toast.success(
          `${data.newPendingReview} unmatched payment${data.newPendingReview === 1 ? "" : "s"} found — ${data.emailSent ? "review email sent." : "review email could not be sent, check server logs."}`,
        );
      } else if (data.newNoCandidates > 0) {
        toast.success(
          `${data.newNoCandidates} unmatched payment${data.newNoCandidates === 1 ? "" : "s"} found, but no in-stock product was close enough in price to guess.`,
        );
      } else {
        toast.success(
          `No unmatched Stripe payments found (${data.scannedSucceededPayments} checked).`,
        );
      }
    },
    onError: (err) =>
      toast.error(
        err.message || "Stripe reconciliation failed. Please try again.",
      ),
  });

  const posAttributionMutation = trpc.reconciliation.runPos.useMutation({
    onSuccess: (data) => {
      if (data.newPendingReview > 0) {
        toast.success(
          `${data.newPendingReview} amount-only sale${data.newPendingReview === 1 ? "" : "s"} to confirm — ${data.emailSent ? "review email sent." : "review email could not be sent, check server logs."}`,
        );
      } else if (data.newNoCandidates > 0) {
        toast.success(
          `${data.newNoCandidates} amount-only sale${data.newNoCandidates === 1 ? "" : "s"} found, but no in-stock piece was close enough in price to guess.`,
        );
      } else {
        toast.success(
          `No unattributed in-person sales found (${data.scannedLines} checked).`,
        );
      }
    },
    onError: (err) =>
      toast.error(
        err.message ||
          "In-person sale reconciliation failed. Please try again.",
      ),
  });

  const insightsMutation = trpc.products.insights.useMutation({
    onSuccess: (data) => {
      setInsightsData(data);
      setShowInsights(true);
    },
    onError: () =>
      toast.error("Failed to generate insights. Please try again."),
  });

  const duplicateCheckMutation = trpc.products.checkDuplicate.useMutation();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.description || !form.price) {
      toast.error("Please fill in all required fields");
      return;
    }
    const price = parseFloat(form.price);
    if (Number.isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price");
      return;
    }
    const quantity = parseInt(form.quantity, 10);

    // Run duplicate check on first submit
    if (dupState === "idle") {
      setDupState("checking");
      try {
        const result = await duplicateCheckMutation.mutateAsync({
          name: form.name,
          description: form.description,
          category: form.category,
        });
        if (result.duplicates.length > 0) {
          setDupResults(result.duplicates);
          setDupState("found");
          return;
        }
      } catch {
        // Check failed — proceed to create without blocking
      }
      setDupState("idle");
    }

    // Either no duplicates found, or user clicked "Add Anyway"
    setDupState("idle");
    setDupResults([]);
    createMutation.mutate({
      name: form.name,
      description: form.description,
      price,
      category: form.category,
      quantity: Number.isNaN(quantity) || quantity < 0 ? 1 : quantity,
      imageUrl: form.imageUrl || undefined,
    });
  };

  // Auth guard
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
          <div className="text-5xl text-[var(--brand-accent)]/30 font-serif mb-6">
            ◇
          </div>
          <h2 className="font-serif text-foreground text-2xl mb-4">
            Admin Access
          </h2>
          <p className="text-muted-foreground text-sm font-sans mb-8">
            Please sign in to access the admin panel.
          </p>
          <a
            href={getLoginUrl(window.location.href)}
            className="inline-flex items-center gap-2 bg-[var(--brand-ink)] text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
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
          <div className="text-5xl text-[var(--brand-accent)]/30 font-serif mb-6">
            ✕
          </div>
          <h2 className="font-serif text-foreground text-2xl mb-4">
            Access Denied
          </h2>
        </div>
      </div>
    );

  // Derived stats
  const inStock =
    products?.filter((p) => p.visible && !p.sold && p.quantity > 0).length ?? 0;
  const soldOut =
    products?.filter((p) => p.sold || p.quantity <= 0).length ?? 0;
  const inventoryValue =
    products
      ?.filter((p) => !p.sold && p.quantity > 0)
      .reduce((sum, p) => sum + Number(p.price) * p.quantity, 0) ?? 0;

  return (
    <div className="page-enter pt-20 min-h-screen bg-[var(--brand-surface)]">
      {/* First-run guided tour of the dashboard (coach marks). */}
      <GuidedTour
        tourId={ADMIN_TOUR_ID}
        steps={ADMIN_TOUR_STEPS}
        startSignal={tourSignal}
      />
      {/* Header */}
      <section className="bg-[var(--brand-ink)] py-12">
        <div className="container flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-hand text-[var(--brand-accent)] leading-none mb-1">
              Your maker&rsquo;s bench
            </p>
            <h1
              data-tour="admin-title"
              className="font-serif text-white text-2xl"
            >
              Catalogue Management
            </h1>
            <div className="mt-1.5 w-44 text-[var(--brand-accent)]/70">
              <SketchUnderline />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/admin/bulk-upload"
              data-tour="bulk-upload"
              className="flex items-center gap-2 bg-[var(--brand-accent)] text-[var(--brand-ink)] px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans font-semibold hover:brightness-110 transition-[filter]"
            >
              <Camera size={14} />
              Add by Camera
            </Link>
            <Link
              href="/admin/csv-import"
              data-tour="csv-import"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors"
            >
              <FileSpreadsheet size={14} />
              CSV Import
            </Link>
            <Link
              href="/admin/duplicates"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors"
            >
              <Copy size={14} />
              Duplicate Cleanup
            </Link>
            <Link
              href="/admin/billing"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors"
            >
              <CreditCard size={14} />
              Plan &amp; Billing
            </Link>
            <button
              type="button"
              onClick={() => previewRecategoriseMutation.mutate()}
              disabled={previewRecategoriseMutation.isPending}
              title="AI re-categorise all products in 'Other' into the correct body-part category (review before applying)"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors disabled:opacity-50"
            >
              {previewRecategoriseMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Tag size={14} />
              )}
              Re-Categorise
            </button>
            <button
              type="button"
              onClick={() => previewTranslateMutation.mutate()}
              disabled={previewTranslateMutation.isPending}
              data-tour="auto-translate"
              title="Fill missing English translations using AI (review before applying)"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors disabled:opacity-50"
            >
              {previewTranslateMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Languages size={14} />
              )}
              Auto-Translate
            </button>
            <button
              type="button"
              onClick={handleTranslateLocales}
              disabled={translatingLocales}
              title="Fill missing German, English and French storefront translations for every product using AI"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors disabled:opacity-50"
            >
              {translatingLocales ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Languages size={14} />
              )}
              Translate de/en/fr
            </button>
            <button
              type="button"
              onClick={() => reconciliationMutation.mutate({})}
              disabled={reconciliationMutation.isPending}
              title="Check for Stripe payments missing from our records and email a match request for each"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors disabled:opacity-50"
            >
              {reconciliationMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CreditCard size={14} />
              )}
              Reconcile Stripe Payments
            </button>
            <button
              type="button"
              onClick={() => posAttributionMutation.mutate({})}
              disabled={posAttributionMutation.isPending}
              title="Find amount-only in-person sales and email a request to confirm which piece each one sold"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors disabled:opacity-50"
            >
              {posAttributionMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Receipt size={14} />
              )}
              Confirm In-Person Sales
            </button>
            {stripeConnectQuery.data?.connected ? (
              <span
                data-tour="connect-stripe"
                title="This store's own Stripe account is linked — checkout pays out directly to you"
                className="flex items-center gap-2 border border-emerald-400/40 text-emerald-300 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans"
              >
                <CheckCircle2 size={14} />
                Stripe Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={handleConnectStripe}
                disabled={stripeConnectQuery.isLoading}
                data-tour="connect-stripe"
                title="Link your OWN Stripe account so your storefront's customers pay directly into it"
                className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors disabled:opacity-50"
              >
                {stripeConnectQuery.isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CreditCard size={14} />
                )}
                Connect Stripe
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearTourCompletion(ADMIN_TOUR_ID);
                setTourSignal((n) => n + 1);
              }}
              title="Replay the guided tour of this dashboard"
              aria-label="Replay guided tour"
              className="flex items-center gap-2 border border-white/20 text-white/80 px-3 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-white hover:text-white transition-colors"
            >
              <HelpCircle size={14} />
              Tour
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              data-tour="add-product"
              className="flex items-center gap-2 bg-[var(--brand-accent)] text-[var(--brand-ink)] px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-sans font-medium hover:bg-[var(--brand-accent-light)] transition-colors"
            >
              <Plus size={14} />
              Add Product
            </button>
          </div>
        </div>
      </section>

      <div className="container py-10">
        {/* What Zolto does for this seller — live capability status */}
        <CapabilityBand
          storeConnected={!!stripeConnectQuery.data?.connected}
          insightsReady={!!insightsData}
          onConnectStore={handleConnectStripe}
          onViewInsights={() => {
            if (!insightsData && !insightsMutation.isPending) {
              insightsMutation.mutate();
            }
            setShowInsights(true);
            document
              .getElementById("ai-insights")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />

        {/* Live setup checklist (server-derived; dismissible) */}
        <OnboardingChecklist />

        {/* Sales & inventory insights (stats for all plans, AI narrative on Pro) */}
        <InsightsCard />

        {/* Add Product Form */}
        {showAddForm && (
          <div className="bg-white border border-[var(--brand-border)] p-8 mb-8">
            <h2 className="font-serif text-foreground text-xl mb-6">
              Add New Product
            </h2>
            <form
              onSubmit={handleCreate}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <div>
                <label
                  htmlFor="create-name"
                  className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2"
                >
                  Name <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <input
                  id="create-name"
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  required
                  className="w-full border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
                  placeholder="e.g. Moonstone Drop Earrings"
                />
              </div>

              <div>
                <label
                  htmlFor="create-price"
                  className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2"
                >
                  Price (CHF){" "}
                  <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <input
                  id="create-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, price: e.target.value }))
                  }
                  required
                  className="w-full border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
                  placeholder="e.g. 185.00"
                />
              </div>

              <div>
                <label
                  htmlFor="create-category"
                  className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2"
                >
                  Category <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <select
                  id="create-category"
                  value={form.category}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      category: e.target.value as ProductCategory,
                    }))
                  }
                  className="w-full border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="create-quantity"
                  className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2"
                >
                  Quantity
                </label>
                <input
                  id="create-quantity"
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, quantity: e.target.value }))
                  }
                  className="w-full border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
                  placeholder="1"
                />
              </div>

              <div>
                <label
                  htmlFor="create-imageUrl"
                  className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2"
                >
                  Image URL
                </label>
                <input
                  id="create-imageUrl"
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, imageUrl: e.target.value }))
                  }
                  className="w-full border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent"
                  placeholder="https://..."
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="create-description"
                  className="block text-xs uppercase tracking-[0.15em] text-foreground font-sans mb-2"
                >
                  Description{" "}
                  <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <textarea
                  id="create-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  required
                  rows={3}
                  className="w-full border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] transition-colors bg-transparent resize-none"
                  placeholder="Describe the piece..."
                />
              </div>

              {/* Duplicate warning */}
              {dupState === "found" && dupResults.length > 0 && (
                <div className="md:col-span-2 bg-amber-50 border border-amber-200 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <ShieldAlert
                      size={16}
                      className="text-amber-600 flex-shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-sans text-amber-800 font-medium">
                        Possible duplicate detected
                      </p>
                      <p className="text-xs text-amber-700 font-sans mt-0.5">
                        The following existing products appear similar to the
                        one you're adding:
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-1 mb-3 ml-7">
                    {dupResults.map((d) => (
                      <li
                        key={d.id}
                        className="text-xs font-sans text-amber-800"
                      >
                        <span
                          className={`inline-block w-12 text-center text-[9px] uppercase tracking-wide px-1.5 py-0.5 mr-2 font-medium ${d.confidence === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                        >
                          {d.confidence}
                        </span>
                        <span className="font-medium">{d.name}</span>
                        <span className="text-amber-600"> — {d.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-3 ml-7">
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="flex items-center gap-2 bg-amber-700 text-white px-5 py-2 text-xs uppercase tracking-[0.15em] font-sans hover:bg-amber-800 transition-colors disabled:opacity-60"
                    >
                      {createMutation.isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Add Anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDupState("idle");
                        setDupResults([]);
                      }}
                      className="px-5 py-2 text-xs uppercase tracking-[0.15em] font-sans text-muted-foreground border border-[var(--brand-ink)]/20 hover:border-[var(--brand-ink)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="md:col-span-2 flex gap-4">
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    dupState === "checking" ||
                    dupState === "found"
                  }
                  className="flex items-center gap-2 bg-[var(--brand-ink)] text-white px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors disabled:opacity-60"
                >
                  {createMutation.isPending || dupState === "checking" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {dupState === "checking" ? "Checking..." : "Add Product"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setForm(EMPTY_FORM);
                    setDupState("idle");
                    setDupResults([]);
                  }}
                  className="px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans text-muted-foreground border border-[var(--brand-ink)]/20 hover:border-[var(--brand-ink)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Stats — counts read as plain figures; inventory value is the hero
            money tile and gets distinct, institutional (never hand-drawn)
            treatment. Sold Out turns to a warning tone only when > 0. */}
        {products && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Products", value: products.length },
              { label: "In Stock", value: inStock },
              {
                label: "Sold Out",
                value: soldOut,
                warn: soldOut > 0,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white border border-[var(--brand-border)] p-5 text-center"
              >
                <p
                  className={`font-serif text-3xl mb-1 tabular-nums ${
                    stat.warn ? "text-amber-700" : "text-[var(--brand-ink)]"
                  }`}
                >
                  {stat.value}
                </p>
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">
                  {stat.label}
                </p>
              </div>
            ))}
            {/* Hero money tile */}
            <div className="bg-[var(--brand-ink)] p-5 text-center flex flex-col justify-center">
              <p className="font-serif text-white text-3xl mb-1 tabular-nums">
                <span className="text-[var(--brand-accent)] text-base align-top mr-1">
                  CHF
                </span>
                {inventoryValue.toLocaleString("de-CH", {
                  maximumFractionDigits: 0,
                })}
              </p>
              <p className="text-xs uppercase tracking-[0.15em] text-[var(--brand-accent)] font-sans">
                Inventory Value
              </p>
            </div>
          </div>
        )}

        {/* AI Insights */}
        <div
          id="ai-insights"
          data-tour="insights"
          className="mb-8 bg-white border border-[var(--brand-border)] overflow-hidden scroll-mt-24"
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
            <div>
              <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-1 font-sans">
                AI
              </p>
              <h2 className="font-serif text-foreground text-xl">
                Sales & Inventory Insights
              </h2>
              <p className="text-muted-foreground text-xs font-sans mt-1">
                AI-generated analysis of your catalogue and sales data
              </p>
            </div>
            <div className="flex items-center gap-3">
              {insightsData && (
                <button
                  type="button"
                  onClick={() => setShowInsights((v) => !v)}
                  className="text-xs font-sans text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  {showInsights ? "Hide" : "Show"}
                </button>
              )}
              <button
                type="button"
                onClick={() => insightsMutation.mutate()}
                disabled={insightsMutation.isPending}
                className="flex items-center gap-2 bg-[var(--brand-ink)] text-white px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors disabled:opacity-50"
              >
                {insightsMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : insightsData ? (
                  <RefreshCw size={13} />
                ) : (
                  <BarChart3 size={13} />
                )}
                {insightsData ? "Refresh" : "Generate Insights"}
              </button>
            </div>
          </div>

          {insightsMutation.isPending && (
            <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2
                size={20}
                className="animate-spin text-[var(--brand-accent)]"
              />
              <p className="text-sm font-sans">
                Analysing your catalogue and sales data…
              </p>
            </div>
          )}

          {showInsights && insightsData && !insightsMutation.isPending && (
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Highlights */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp
                    size={14}
                    className="text-[var(--brand-accent)]"
                  />
                  <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-sans">
                    Highlights
                  </h3>
                </div>
                <ul className="space-y-2.5">
                  {insightsData.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 flex-shrink-0 bg-[var(--brand-surface)] text-[var(--brand-ink)] rounded-full flex items-center justify-center text-[10px] font-bold font-sans mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm font-sans text-foreground leading-relaxed">
                        {h}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb size={14} className="text-[var(--brand-accent)]" />
                  <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-sans">
                    Recommendations
                  </h3>
                </div>
                <ul className="space-y-2.5">
                  {insightsData.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 flex-shrink-0 bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] rounded-full flex items-center justify-center text-[10px] font-bold font-sans mt-0.5">
                        →
                      </span>
                      <p className="text-sm font-sans text-foreground leading-relaxed">
                        {r}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Top Category & Slow Movers */}
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--brand-border)]">
                <div className="bg-[var(--brand-surface)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans mb-1">
                    Top Category
                  </p>
                  <p className="font-serif text-foreground text-lg">
                    {insightsData.topCategory}
                  </p>
                </div>
                {insightsData.slowMovers.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertCircle size={12} className="text-amber-600" />
                      <p className="text-[10px] uppercase tracking-[0.2em] text-amber-700 font-sans">
                        Slow Movers
                      </p>
                    </div>
                    <ul className="space-y-1">
                      {insightsData.slowMovers.map((name, i) => (
                        <li
                          key={i}
                          className="text-sm font-sans text-amber-900"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {!insightsData && !insightsMutation.isPending && (
            <div className="text-center py-10 text-muted-foreground">
              <BarChart3
                size={32}
                className="mx-auto mb-3 text-[var(--brand-accent)]/30"
              />
              <p className="text-sm font-sans">
                Click "Generate Insights" to get AI-powered analysis of your
                sales and inventory.
              </p>
            </div>
          )}
        </div>

        {/* Product Table */}
        {productsLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2
              className="animate-spin text-[var(--brand-ink)]"
              size={32}
            />
          </div>
        ) : products && products.length > 0 ? (
          <div className="space-y-6">
            <ProductDiscoveryControls
              sortBy={sortBy}
              onSortChange={setSortBy}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              expandedCategories={expandedCategories}
              onToggleCategory={(cat) => {
                if (cat === "__expand_all__") {
                  setExpandedCategories(new Set(CATEGORIES.map((c) => c)));
                } else if (cat === "__collapse_all__") {
                  setExpandedCategories(new Set());
                } else {
                  setExpandedCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    return next;
                  });
                }
              }}
              totalProducts={products.length}
            />
            {sortBy === "category" ? (
              /* ── Category-grouped view ── */
              <div className="space-y-2">
                {CATEGORIES.filter((cat) =>
                  sortedProducts.some((p) => p.category === cat),
                ).map((cat) => {
                  const catProducts = sortedProducts.filter(
                    (p) => p.category === cat,
                  );
                  const isExpanded = expandedCategories.has(cat);
                  return (
                    <ProductCategoryGroup
                      key={cat}
                      category={cat}
                      isExpanded={isExpanded}
                      onToggle={() =>
                        setExpandedCategories((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat)) next.delete(cat);
                          else next.add(cat);
                          return next;
                        })
                      }
                      productCount={catProducts.length}
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <tbody>
                            {catProducts.map((product) => (
                              <ProductRow
                                key={product.id}
                                product={product}
                                onRefetch={refetch}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </ProductCategoryGroup>
                  );
                })}
              </div>
            ) : (
              /* ── Flat table view (newest / name) ── */
              <div className="bg-white border border-[var(--brand-border)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
                        <th className="text-left px-6 py-4 text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans font-normal">
                          Product
                        </th>
                        <th className="text-left px-4 py-4 text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans font-normal hidden md:table-cell">
                          Category
                        </th>
                        <th className="text-left px-4 py-4 text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans font-normal">
                          Price
                        </th>
                        <th className="text-left px-4 py-4 text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans font-normal">
                          Qty
                        </th>
                        <th className="text-left px-4 py-4 text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans font-normal hidden sm:table-cell">
                          Status
                        </th>
                        <th className="text-right px-6 py-4 text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans font-normal">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProducts.map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          onRefetch={refetch}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[var(--brand-border)] text-center py-24">
            <div className="text-5xl text-[var(--brand-accent)]/20 font-serif mb-4">
              ◇
            </div>
            <p className="font-hand text-[var(--brand-accent)] mb-2">
              A blank page for your bench
            </p>
            <h3 className="font-serif text-foreground text-xl mb-3">
              No products yet
            </h3>
            <p className="text-muted-foreground text-sm font-sans mb-6">
              Add your first product manually, via CSV import, or bulk photo
              upload.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 bg-[var(--brand-ink)] text-white px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
              >
                <Plus size={14} />
                Add First Product
              </button>
              <Link
                href="/admin/csv-import"
                className="inline-flex items-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-white transition-colors"
              >
                <FileSpreadsheet size={14} />
                CSV Import
              </Link>
            </div>
          </div>
        )}

        {/* Instagram Post Grid Manager */}
        <div className="mt-8 bg-white border border-[var(--brand-border)] p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-1 font-sans">
                Instagram
              </p>
              <h2 className="font-serif text-foreground text-xl">
                Curated Post Grid
              </h2>
              <p className="text-muted-foreground text-xs font-sans mt-1">
                Paste Instagram post or reel URLs below. They will appear as
                embedded posts on the home page.
              </p>
            </div>
            <Instagram
              size={28}
              className="text-[var(--brand-accent)] flex-shrink-0"
            />
          </div>
          <InstagramManager />
        </div>

        {/* Bulk Upload AI Error Logs */}
        <div className="mt-8 bg-white border border-[var(--brand-border)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
            <div>
              <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-1 font-sans">
                Debug
              </p>
              <h2 className="font-serif text-foreground text-xl">
                Bulk Upload AI Logs
              </h2>
              <p className="text-muted-foreground text-xs font-sans mt-1">
                Failures from AI analysis and product creation during bulk
                upload
              </p>
            </div>
            <AlertTriangle size={24} className="text-amber-500 flex-shrink-0" />
          </div>
          {bulkLogsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2
                className="animate-spin text-[var(--brand-ink)]"
                size={24}
              />
            </div>
          ) : !bulkLogs || bulkLogs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm font-sans">
                No errors recorded yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b border-[var(--brand-border)]">
                    <th className="text-left px-6 py-3 text-xs uppercase tracking-[0.15em] text-muted-foreground font-normal">
                      Time
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.15em] text-muted-foreground font-normal">
                      Operation
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.15em] text-muted-foreground font-normal">
                      Reference
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.15em] text-muted-foreground font-normal">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bulkLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-[var(--brand-border)] last:border-0 hover:bg-[var(--brand-surface-2)]"
                    >
                      <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 font-sans ${
                            log.operation === "analyze"
                              ? "bg-blue-50 text-blue-700"
                              : log.operation === "create"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {log.operation === "extra_image"
                            ? "image"
                            : log.operation}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-xs text-foreground max-w-[180px] truncate"
                        title={log.ref}
                      >
                        {log.ref}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-700 font-mono max-w-[400px] break-all">
                        {log.errorMessage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Discord Integration Info */}
        <div className="mt-8 bg-[var(--brand-ink)] p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="text-[var(--brand-accent)] text-2xl font-serif mt-1 flex-shrink-0">
              ◈
            </div>
            <div>
              <h3 className="font-serif text-white text-lg mb-2">
                Discord Integration
              </h3>
              <p className="text-white/60 text-sm font-sans leading-relaxed mb-4">
                Post a message in your connected Discord channel with a photo,
                description, and price — the product will be automatically added
                to the catalogue.
              </p>
              <div className="bg-white/5 border border-white/10 p-4 font-mono text-xs text-white/70 leading-relaxed">
                <p className="text-[var(--brand-accent)] mb-1">
                  Example Discord message:
                </p>
                <p>
                  Sterling silver moonstone ring. Delicate band with a 8mm round
                  moonstone, oxidised finish. Price: CHF 220
                </p>
              </div>
              <p className="text-white/40 text-xs font-sans mt-3">
                The bot listens to your designated Discord channel in real time
                via the Gateway API.
              </p>
            </div>
          </div>
        </div>
      </div>

      <BulkChangeReviewDialog
        open={showRecategorizeReview}
        title="Review category changes"
        description="These products will move out of 'Other' into the category shown. Uncheck anything you don't want changed."
        items={recategorizeProposals.map((p) => ({
          id: p.id,
          label: `${p.name}: ${p.from} → ${p.to}`,
        }))}
        isApplying={applyRecategoriseMutation.isPending}
        onCancel={() => setShowRecategorizeReview(false)}
        onConfirm={(selectedIds) =>
          applyRecategoriseMutation.mutate({
            items: recategorizeProposals
              .filter((p) => selectedIds.includes(p.id))
              .map((p) => ({ id: p.id, category: p.to as ProductCategory })),
          })
        }
      />

      <BulkChangeReviewDialog
        open={showTranslateReview}
        title="Review translations"
        description="These English translations will be filled in. Uncheck anything you don't want applied."
        items={translateProposals.map((p) => ({
          id: p.id,
          label: `${p.name} → "${p.nameEn}"`,
        }))}
        isApplying={applyTranslateMutation.isPending}
        onCancel={() => setShowTranslateReview(false)}
        onConfirm={(selectedIds) =>
          applyTranslateMutation.mutate({
            items: translateProposals
              .filter((p) => selectedIds.includes(p.id))
              .map((p) => ({
                id: p.id,
                nameEn: p.nameEn,
                descriptionEn: p.descriptionEn,
              })),
          })
        }
      />
    </div>
  );
}
