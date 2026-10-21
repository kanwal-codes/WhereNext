"use client";

import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { Reveal } from "@/components/motion-primitives";
import { withPhotoWidth } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

/** The strip of more photos under About; each opens the lightbox at its own place. */
export function PlacePhotos({ photos, name, panel, onOpen }: { photos: string[]; name: string; panel: boolean; onOpen: (index: number) => void }) {
  if (photos.length === 0) return null;
  return (
    <Reveal delay={0.08}>
      <section>
        <DetailSectionHeading>Photos</DetailSectionHeading>
        <div className={cn("mt-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain no-scrollbar px-1 pb-14 -mb-12 pt-2", panel ? "" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
          {photos.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`Expand photo ${i + 1} of ${name}`}
              className="shrink-0 snap-start rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy */}
              <img src={withPhotoWidth(src, 640)} alt="" loading="lazy" width={288} height={192} className="h-44 w-72 rounded-2xl border border-border object-cover transition-opacity hover:opacity-90" />
            </button>
          ))}
        </div>
      </section>
    </Reveal>
  );
}
