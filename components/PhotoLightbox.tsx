"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";

/** Which photo (if any) is open, plus the open/close/step actions for it. */
export function usePhotoLightbox() {
  const [index, setIndex] = useState<number | null>(null);
  return { index, open: setIndex, close: () => setIndex(null) };
}

/**
 * Full-size view of one photo from a strip, with prev/next through the same set. Built on
 * the shared `Sheet` primitive (backdrop, focus trap, Escape-to-close) rather than a new
 * modal — only the panel's own sizing is overridden to fit an image instead of a form.
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  alt,
}: {
  photos: string[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  alt: string;
}) {
  const src = index !== null ? photos[index] : null;
  const step = (delta: number) => {
    if (index === null) return;
    onIndexChange((index + delta + photos.length) % photos.length);
  };

  const sheet = (
    <Sheet
      open={src !== null}
      onClose={onClose}
      side="center"
      ariaLabel={alt}
      className="max-w-none w-auto max-h-[92dvh] rounded-2xl bg-transparent p-0 shadow-none"
    >
      {src && (
        <div className="relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition-colors hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous photo"
                className="absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next photo"
                className="absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- full-resolution photo shown at native size, not a thumbnail to optimize */}
          <img src={src} alt={alt} className="max-h-[92dvh] max-w-[92vw] rounded-2xl object-contain" />
        </div>
      )}
    </Sheet>
  );

  // Portalled to <body> — this can open from deep inside an animated trip panel/drawer, and
  // a `position: fixed` descendant of any ancestor with an active CSS `transform` (every
  // Framer Motion panel here) resolves against that ancestor instead of the viewport.
  return typeof document !== "undefined" ? createPortal(sheet, document.body) : null;
}
