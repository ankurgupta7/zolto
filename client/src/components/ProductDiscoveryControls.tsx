import { useTranslation } from "react-i18next";
// Ensure the shared i18n instance is initialized even when this control is
// rendered in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import {
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type SortOption = "newest" | "category" | "name";
export type ViewMode = "grid" | "list";

interface ProductDiscoveryControlsProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  expandedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  totalProducts: number;
  /** Current filter text. Omit to render without the search box. */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  /** How many of `totalProducts` survive the filter. */
  matchCount?: number;
}

export default function ProductDiscoveryControls({
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  expandedCategories,
  onToggleCategory,
  totalProducts,
  searchQuery,
  onSearchChange,
  matchCount,
}: ProductDiscoveryControlsProps) {
  const { t } = useTranslation();
  const searchable = onSearchChange !== undefined;
  const query = searchQuery ?? "";
  const filtering = query.trim().length > 0;

  return (
    <div className="bg-white border border-[var(--brand-border)] p-6 mb-6">
      <div className="flex flex-col gap-4">
        {/* Filter box — narrows the list in place; there is nowhere to go. */}
        {searchable && (
          <div className="relative">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => onSearchChange?.(e.target.value)}
              // Escape is how people dismiss a filter; `type="search"` clears
              // on it in some browsers and not others, so do it here.
              onKeyDown={(e) => {
                if (e.key === "Escape") onSearchChange?.("");
              }}
              aria-label={t("discovery.searchLabel")}
              placeholder={t("discovery.searchPlaceholder")}
              className="w-full border border-[var(--brand-border)] bg-[var(--brand-surface)] pl-10 pr-10 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--brand-accent)] [&::-webkit-search-cancel-button]:appearance-none"
            />
            {filtering && (
              <button
                type="button"
                onClick={() => onSearchChange?.("")}
                aria-label={t("discovery.clearSearch")}
                title={t("discovery.clearSearch")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-[var(--brand-ink)] transition-colors"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Top row: Sort and View Mode */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-select"
                className="text-xs uppercase tracking-[0.15em] text-foreground font-sans font-medium"
              >
                {t("discovery.sortBy")}
              </label>
              <Select
                value={sortBy}
                onValueChange={(v) => onSortChange(v as SortOption)}
              >
                <SelectTrigger
                  id="sort-select"
                  className="w-[180px] text-xs uppercase tracking-[0.15em]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">
                    {t("discovery.sortNewest")}
                  </SelectItem>
                  <SelectItem value="category">
                    {t("discovery.sortCategory")}
                  </SelectItem>
                  <SelectItem value="name">
                    {t("discovery.sortName")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.15em] text-foreground font-sans font-medium">
                {t("discovery.view")}
              </span>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => {
                  if (v) onViewModeChange(v as ViewMode);
                }}
                className="border border-[var(--brand-border)]"
              >
                <ToggleGroupItem
                  value="grid"
                  aria-label={t("discovery.gridView")}
                  title={t("discovery.gridViewTitle")}
                  className="data-[state=on]:bg-[var(--brand-ink)] data-[state=on]:text-white"
                >
                  <LayoutGrid size={16} />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="list"
                  aria-label={t("discovery.listView")}
                  title={t("discovery.listViewTitle")}
                  className="data-[state=on]:bg-[var(--brand-ink)] data-[state=on]:text-white"
                >
                  <List size={16} />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Product count — while filtering it reports the catch, not the
              catalogue, so a merchant can see at a glance how much the query
              actually narrowed things. */}
          <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans lining-nums">
            {filtering && matchCount !== undefined
              ? t("discovery.matching", {
                  count: matchCount,
                  total: totalProducts,
                })
              : t("discovery.products", { count: totalProducts })}
          </div>
        </div>

        {/* Category collapse/expand all buttons (shown when sorting by category) */}
        {sortBy === "category" && (
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--brand-border)]">
            <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">
              {t("discovery.categories")}
            </span>
            <button
              type="button"
              onClick={() => {
                // This will be handled by parent component
                onToggleCategory("__expand_all__");
              }}
              className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-[var(--brand-ink)] font-sans hover:text-[var(--brand-accent)] transition-colors"
            >
              <ChevronDown size={14} />
              {t("discovery.expandAll")}
            </button>
            <button
              type="button"
              onClick={() => {
                // This will be handled by parent component
                onToggleCategory("__collapse_all__");
              }}
              className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-[var(--brand-ink)] font-sans hover:text-[var(--brand-accent)] transition-colors"
            >
              <ChevronUp size={14} />
              {t("discovery.collapseAll")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
