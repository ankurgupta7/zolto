import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  images: string[];
  activeIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (i: number) => void;
}

export default function ImageLightbox({ images, activeIndex, onClose, onNext, onPrev, onGoTo }: Props) {
  const hasMultiple = images.length > 1;

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowRight" && hasMultiple) onNext();
    if (e.key === "ArrowLeft" && hasMultiple) onPrev();
  }, [onClose, onNext, onPrev, hasMultiple]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      // Close only when the backdrop itself is clicked, not the image/controls.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Full image view"
    >
      <img
        src={images[activeIndex]}
        alt={`View ${activeIndex + 1} of ${images.length}`}
        className="max-h-[90vh] max-w-[90vw] object-contain select-none"
        draggable={false}
      />

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-white/10 text-white hover:bg-white/25 transition-colors rounded-full"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      {/* Counter */}
      {hasMultiple && (
        <div className="absolute top-4 left-4 text-white/60 text-xs font-sans tracking-widest">
          {activeIndex + 1} / {images.length}
        </div>
      )}

      {/* Prev */}
      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/10 text-white hover:bg-white/25 transition-colors rounded-full"
          aria-label="Previous image"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {/* Next */}
      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/10 text-white hover:bg-white/25 transition-colors rounded-full"
          aria-label="Next image"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Dot strip */}
      {hasMultiple && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((_, i) => (
            <button
              type="button"
              key={i}
              onClick={(e) => { e.stopPropagation(); onGoTo(i); }}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeIndex ? "bg-[#B8963E] w-5" : "bg-white/30 hover:bg-white/60 w-1.5"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
