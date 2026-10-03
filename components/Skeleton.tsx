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

export function SkeletonCards({ count = 3, className, cardClassName }: { count?: number; className?: string; cardClassName?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className={cardClassName} />
      ))}
    </div>
  );
}
