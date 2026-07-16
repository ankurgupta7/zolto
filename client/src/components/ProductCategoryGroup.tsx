import { ChevronDown, ChevronUp } from "lucide-react";
import { ReactNode } from "react";

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
    <div className="bg-white border border-[#E0D8CC] mb-4 overflow-hidden">
      {/* Category Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 bg-[#EDE7DF] hover:bg-[#DDD5CC] transition-colors border-b border-[#E0D8CC]"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronUp size={18} className="text-[#2D2620]" />
          ) : (
            <ChevronDown size={18} className="text-[#2D2620]" />
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
