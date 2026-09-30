"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { controlSecondary } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";

/**
 * The loading and failure states every detail view (place, stay, event) shares, so they behave the
 * same in the side panel and on the full page. A skeleton that stays blank for many seconds reads
 * as broken, so after a moment it says what is happening, and after a longer one it says it is slow.
 */
export function PanelLoading({ what, panel, heroClassName, children }: { what: string; panel: boolean; heroClassName?: string; children?: ReactNode }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const slow = setTimeout(() => setPhase(1), 2500);
    const slower = setTimeout(() => setPhase(2), 9000);
    return () => {
      clearTimeout(slow);
      clearTimeout(slower);
    };
  }, []);
  const pad = panel ? "px-4 pb-8" : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";
  return (
    <div aria-busy="true">
      <Skeleton className={cn("rounded-none", heroClassName ?? (panel ? "h-44" : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]"))} />
      <div className={cn(pad, "pt-6")}>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {phase === 0 ? <span className="sr-only">Loading {what}</span> : phase === 1 ? `Loading ${what}…` : `Still loading ${what} — the source is slow today. You can keep chatting meanwhile.`}
        </p>
        <Skeleton className="mt-3 h-8 w-2/3 rounded-lg" />
        <SkeletonLines lines={3} className="mt-6" />
        {children}
      </div>
    </div>
  );
}

/** A failed load: says what failed, offers Retry, and never points at a screen the user isn't on. */
export function PanelError({ what, panel, onRetry, children }: { what: string; panel: boolean; onRetry?: () => void; children?: ReactNode }) {
  const pad = panel ? "px-4 pb-8" : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";
  return (
    <div className={cn(pad, "pt-10")}>
      <div role="alert" className="daisy-alert daisy-alert-soft items-start gap-3 rounded-2xl border-0 bg-muted p-4">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-caution" aria-hidden />
        <div className="min-w-0 space-y-1.5">
          <h2 className="font-display text-base font-semibold leading-snug">We couldn’t load {what}</h2>
          <p className="text-sm text-muted-foreground">It didn’t come back this time — that usually clears up on its own.</p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {onRetry && (
              <button type="button" onClick={onRetry} className={controlSecondary}>
                <RefreshCw className="size-3.5" aria-hidden /> Try again
              </button>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
