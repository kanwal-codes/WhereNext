import React from "react";
import { cn } from "@/lib/utils";

// `bg-muted` is nearly indistinguishable from `bg-surface` (the panel/sheet background these
// often load inside) — a foreground-mix stays visible against any near-white/near-black
// container instead of only the plain page background.
const pulse = "skeleton";

/** Loading placeholder that keeps the layout's shape. Purely decorative. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cn(pulse, "rounded-2xl", className)} style={style} />;
}

export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn(pulse, "h-3.5 rounded-md")} style={{ width: `${100 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}

/** A card-shaped placeholder: photo, title, one detail line and an action row, so the grid settles into place instead of swapping shapes. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("overflow-hidden rounded-3xl border border-border bg-card", className)}>
      <div className={cn(pulse, "aspect-[16/10] rounded-none")} />
      <div className="space-y-3 p-4">
        <div className={cn(pulse, "h-4 w-3/4 rounded-md")} />
        <div className={cn(pulse, "h-3 w-1/2 rounded-md")} />
        <div className="flex gap-2 pt-1.5">
          <div className={cn(pulse, "h-9 flex-1 rounded-full")} />
          <div className={cn(pulse, "size-9 rounded-full")} />
        </div>
      </div>
    </div>
  );
}

/** A phone list row while it loads: the 96×120 photo, a label, a two-line name, the thin accent, a facts line and an address, and the two round controls. Same height as the real row (144px). */
function SkeletonRow({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex gap-4 rounded-4xl bg-card p-3 pr-3.5 shadow-float ring-1 ring-black/[0.05]", className)}>
      <div className={cn(pulse, "h-[7.5rem] w-24 shrink-0 rounded-2xl")} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <div className={cn(pulse, "h-2.5 w-1/3 rounded-md")} />
        <div className={cn(pulse, "h-4 w-4/5 rounded-md")} />
        <div className={cn(pulse, "h-4 w-3/5 rounded-md")} />
        <div className={cn(pulse, "mt-1 h-3 w-2/5 rounded-md")} />
        <div className={cn(pulse, "h-3 w-3/5 rounded-md")} />
      </div>
      <div className="flex shrink-0 flex-col items-center justify-between py-0.5">
        <div className={cn(pulse, "size-8 rounded-full")} />
        <div className={cn(pulse, "size-10 rounded-full")} />
      </div>
    </div>
  );
}

/** A cinematic photo card while it loads: the photo area with a rating chip, a heart, the name and an address along the bottom, and the round add button. */
export function SkeletonPhotoCard({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn(pulse, "relative overflow-hidden rounded-3xl", className)}>
      <div className="absolute inset-x-3.5 top-3.5 flex items-center justify-between">
        <div className="h-6 w-20 rounded-full bg-foreground/10" />
        <div className="size-10 rounded-full bg-foreground/10" />
      </div>
      <div className="absolute inset-x-3.5 bottom-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-2.5 w-1/4 rounded-md bg-foreground/10" />
          <div className="h-6 w-3/4 rounded-md bg-foreground/10" />
          <div className="h-3 w-1/2 rounded-md bg-foreground/10" />
        </div>
        <div className="size-12 shrink-0 rounded-full bg-foreground/10" />
      </div>
    </div>
  );
}

/** A long list of places, events or stays while it loads: rows on a phone, photo cards from sm up, matching what replaces them. Pass the columns the real grid uses. */
export function SkeletonList({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>
          <SkeletonRow className="sm:hidden" />
          <SkeletonPhotoCard className="aspect-[11/10] max-sm:hidden" />
        </React.Fragment>
      ))}
    </div>
  );
}

/** Discover's bands while they load: a swipeable row of tall cards on a phone, three across from sm up. */
export function SkeletonBand({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex gap-4 overflow-hidden max-sm:-mx-5 max-sm:px-5 sm:grid sm:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonPhotoCard key={i} className="w-[15.5rem] shrink-0 aspect-[3/4] sm:aspect-[11/10] sm:w-auto" />
      ))}
    </div>
  );
}
