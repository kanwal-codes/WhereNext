"use client";

import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { Reveal } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/** The strip of more photos (the first is the cover); each opens the lightbox, and one that fails to load is reported so it can be dropped. */
export function StayPhotos({ images, name, panel, onOpen, onDead }: { images: string[]; name: string; panel: boolean; onOpen: (index: number) => void; onDead: (src: string) => void }) {
  if (images.length <= 1) return null;
  return (
    <Reveal delay={0.08}>
      <section>
        <DetailSectionHeading>Photos</DetailSectionHeading>
        <div className={cn("mt-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-14 -mb-12 pt-2", panel ? "-mr-4 pr-4" : "-mx-5 px-5 sm:mx-0 sm:px-0")}>
          {images.slice(1).map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`Expand photo ${i + 1} of ${name}`}
              className="shrink-0 snap-start rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI */}
              <img src={src} alt="" loading="lazy" width={288} height={192} onError={() => onDead(src)} className="h-44 w-72 rounded-2xl border border-border object-cover transition-opacity hover:opacity-90" />
            </button>
          ))}
        </div>
      </section>
    </Reveal>
  );
}
