import React from "react";
import { cn } from "@/lib/utils";

// `bg-muted` is nearly indistinguishable from `bg-surface` (the panel/sheet background these
// often load inside) — a foreground-mix stays visible against any near-white/near-black
// container instead of only the plain page background.
const pulse = "skeleton";

/** Loading placeholder that keeps the layout's shape. Purely decorative. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn(pulse, "rounded-2xl", className)} />;
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

export function SkeletonCards({ count = 3, className, cardClassName }: { count?: number; className?: string; cardClassName?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-56", cardClassName)} />
      ))}
    </div>
  );
}
