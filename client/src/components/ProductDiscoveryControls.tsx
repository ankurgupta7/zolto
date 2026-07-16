import { useState } from "react";
import { LayoutGrid, List, ChevronDown, ChevronUp } from "lucide-react";
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
}

export default function ProductDiscoveryControls({
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  expandedCategories,
  onToggleCategory,
  totalProducts,
}: ProductDiscoveryControlsProps) {
  return (
    <div className="bg-white border border-[#E0D8CC] p-6 mb-6">
      <div className="flex flex-col gap-4">
        {/* Top row: Sort and View Mode */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-select"
                className="text-xs uppercase tracking-[0.15em] text-foreground font-sans font-medium"
              >
                Sort by:
              </label>
              <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
                <SelectTrigger
                  id="sort-select"
                  className="w-[180px] text-xs uppercase tracking-[0.15em]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="category">By Category</SelectItem>
                  <SelectItem value="name">By Name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.15em] text-foreground font-sans font-medium">
                View:
              </span>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => {
                  if (v) onViewModeChange(v as ViewMode);
                }}
                className="border border-[#E0D8CC]"
              >
                <ToggleGroupItem
                  value="grid"
                  aria-label="Grid view"
                  title="Grid view with thumbnails"
                  className="data-[state=on]:bg-[#2D2620] data-[state=on]:text-white"
                >
                  <LayoutGrid size={16} />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="list"
                  aria-label="List view"
                  title="List view with details"
                  className="data-[state=on]:bg-[#2D2620] data-[state=on]:text-white"
                >
                  <List size={16} />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Product count */}
          <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">
            {totalProducts} product{totalProducts !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Category collapse/expand all buttons (shown when sorting by category) */}
        {sortBy === "category" && (
          <div className="flex items-center gap-2 pt-2 border-t border-[#E0D8CC]">
            <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">
              Categories:
            </span>
            <button
              type="button"
              onClick={() => {
                // This will be handled by parent component
                onToggleCategory("__expand_all__");
              }}
              className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-[#2D2620] font-sans hover:text-[#B8963E] transition-colors"
            >
              <ChevronDown size={14} />
              Expand All
            </button>
            <button
              type="button"
              onClick={() => {
                // This will be handled by parent component
                onToggleCategory("__collapse_all__");
              }}
              className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-[#2D2620] font-sans hover:text-[#B8963E] transition-colors"
            >
              <ChevronUp size={14} />
              Collapse All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
