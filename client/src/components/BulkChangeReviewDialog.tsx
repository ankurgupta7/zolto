import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle } from "lucide-react";

export interface BulkChangeItem {
  id: number;
  label: string;
}

interface Props {
  open: boolean;
  title: string;
  description: string;
  items: BulkChangeItem[];
  isApplying: boolean;
  onCancel: () => void;
  onConfirm: (selectedIds: number[]) => void;
  /** Use for irreversible writes (e.g. permanent deletion) — swaps the
   * confirm button to a warning colour and labels the action accordingly. */
  destructive?: boolean;
  confirmLabel?: string;
}

// Generic "here's exactly what will change — review, deselect anything you
// don't want, then confirm" dialog for AI-computed bulk inventory writes.
// Nothing is written to the database until the admin clicks Confirm.
export default function BulkChangeReviewDialog({
  open,
  title,
  description,
  items,
  isApplying,
  onCancel,
  onConfirm,
  destructive = false,
  confirmLabel = "Change",
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set(items.map(i => i.id)));
  }, [open, items]);

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            {destructive && (
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto border border-[#E0D8CC] divide-y divide-[#E0D8CC]">
          {items.map(item => (
            <label
              key={item.id}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-sans cursor-pointer hover:bg-[#EDE7DF]/50"
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span className="text-foreground">{item.label}</span>
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground font-sans">
          {selected.size} of {items.length} selected — nothing changes until you
          confirm.
          {destructive && " This action is permanent and cannot be undone."}
        </p>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={isApplying}
            className="border border-[#2D2620]/20 text-muted-foreground px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-[#2D2620] hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(Array.from(selected))}
            disabled={isApplying || selected.size === 0}
            className={`flex items-center gap-2 px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans font-medium transition-colors disabled:opacity-60 ${
              destructive
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-[#B8963E] text-[#2D2620] hover:bg-[#D4B060]"
            }`}
          >
            {isApplying && <Loader2 size={14} className="animate-spin" />}
            Confirm {selected.size} {confirmLabel}
            {selected.size !== 1 ? "s" : ""}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
