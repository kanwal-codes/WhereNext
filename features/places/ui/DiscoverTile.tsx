"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Star } from "lucide-react";
import { BlurImage } from "@/components/motion-primitives";
import { CardOpenOverlay, MediaFallback } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";

function TilePhoto({ src, icon, className }: { src?: string | null; icon: LucideIcon; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <MediaFallback icon={icon} className={className} />;
  // The stand-in sits underneath while the photograph loads, so a tile is never a blank grey box.
  return (
    <>
      <MediaFallback icon={icon} className={className} />
      <BlurImage src={src} alt="" onError={() => setFailed(true)} className={className} />
    </>
  );
}

/**
 * Phone redesign: how Discover shows anything it found. The first result is a wide photo with its name on it ("feature"),
 * the rest sit two to a row with the add button on the photo and the name and one line of facts under it. The whole tile
 * opens the place; the corner button adds it. See the Discover render in the approved screens.
 */
export function DiscoverTile({
  label, onOpen, href, src, icon, title, meta, rating, feature = false, pick, save, add, overlay, selected = false,
}: {
  label: string;
  onOpen: () => void;
  href?: string;
  src?: string | null;
  icon: LucideIcon;
  title: string;
  /** One line: "Pizza · Chelsea". */
  meta?: ReactNode;
  rating?: number | null;
  feature?: boolean;
  /** The small pill on the feature photo ("Roam's pick"). */
  pick?: string;
  save?: ReactNode;
  add?: ReactNode;
  overlay?: ReactNode;
  selected?: boolean;
}) {
  const stars = typeof rating === "number" && rating > 0 ? (
    <span className="inline-flex shrink-0 items-center gap-1 font-display font-semibold tabular-nums">
      <Star className="size-3.5 fill-coral text-coral" aria-hidden />
      {rating.toFixed(1)}
    </span>
  ) : null;
  if (feature) {
    return (
      <article data-tappable className={cn("group relative isolate aspect-[16/11] overflow-hidden rounded-3xl bg-muted text-white", selected && "ring-2 ring-coral")}>
        <CardOpenOverlay label={label} onOpen={onOpen} href={href} />
        <TilePhoto src={src} icon={icon} className="photo-grade absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="photo-scrim pointer-events-none absolute inset-0" />
        {pick && <span className="pointer-events-none absolute top-3 left-3 z-[1] rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-coral-ink">{pick}</span>}
        {save && <div className="absolute top-2 right-2 z-[2]">{save}</div>}
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[1] flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-widget leading-[1.15] font-medium tracking-[-0.025em] text-balance">{title}</h3>
            {meta && <p className="mt-0.5 truncate text-sm text-white/85">{meta}</p>}
          </div>
          {stars && <span className="pb-0.5 text-sm text-white">{stars}</span>}
        </div>
        {overlay}
      </article>
    );
  }
  return (
    <article data-tappable className="group relative isolate min-w-0">
      <CardOpenOverlay label={label} onOpen={onOpen} href={href} />
      {/* The photo lets taps through to the open-card overlay beneath it; only the controls on it take their own. */}
      <div className={cn("pointer-events-none relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted", selected && "ring-2 ring-coral")}>
        <TilePhoto src={src} icon={icon} className="photo-grade absolute inset-0 h-full w-full object-cover" />
        {add && <div className="pointer-events-auto absolute right-2 bottom-2 z-[2]">{add}</div>}
        {overlay && <div className="pointer-events-auto contents">{overlay}</div>}
      </div>
      <h3 className="mt-2.5 font-display text-[0.9375rem] leading-snug font-medium tracking-[-0.01em] text-balance">{title}</h3>
      {(meta || stars) && (
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          {meta && <span className="min-w-0 truncate">{meta}</span>}
          {stars && <span className="text-foreground">{stars}</span>}
        </p>
      )}
    </article>
  );
}
