import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

interface ProductCategoryGroupProps {
  category: string;
  isExpanded: boolean;
  onToggle: () => void;
  productCount: number;
  children: ReactNode;
}

export default function ProductCategoryGroup({
  category,
  isExpanded,
  onToggle,
  productCount,
  children,
}: ProductCategoryGroupProps) {
  return (
    <div className="bg-white border border-[var(--brand-border)] mb-4 overflow-hidden">
      {/* Category Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 bg-[var(--brand-surface)] hover:bg-[#DDD5CC] transition-colors border-b border-[var(--brand-border)]"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronUp size={18} className="text-[var(--brand-ink)]" />
          ) : (
            <ChevronDown size={18} className="text-[var(--brand-ink)]" />
          )}
          <span className="font-serif text-foreground text-lg">{category}</span>
          <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">
            ({productCount})
          </span>
        </div>
      </button>

      {/* Category Content */}
      {isExpanded && <div>{children}</div>}
    </div>
  );
}
