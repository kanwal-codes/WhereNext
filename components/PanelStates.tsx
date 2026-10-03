"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

/**
 * How a detail view sits in the side panel, whatever width the panel is given (a 390px phone sheet, a
 * 512px rail, the 720px column beside the chat, an 820px tablet sheet).
 *  - The reading column is capped at 40rem and centred, so text never runs past ~85 characters and a
 *    button never becomes a 790px bar.
 *  - The hero scales with the panel (2:1) instead of being a fixed strip, never shorter than 11rem or
 *    taller than 20rem, so a wide panel shows the photograph and not a sliver of it.
 */
export const PANEL_PAD = "mx-auto w-full max-w-[40rem] px-4 pb-8 sm:px-6";
// `w-full` matters: without a definite width, a height clamped by max-h shrinks the width to keep the ratio.
export const PANEL_HERO = "aspect-[2/1] w-full min-h-44 max-h-80";

/**
 * The loading and failure states every detail view (place, stay, event) shares, so they behave the
 * same in the side panel and on the full page. The skeleton has the loaded panel's own shape (hero,
 * eyebrow, title, address, primary action, fact strip, body) so the content settles into place instead
 * of replacing a different layout. A skeleton that stays blank for many seconds reads as broken, so
 * after a moment it says what is happening, and after a longer one it says it is slow.
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
  const pad = panel ? PANEL_PAD : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";
  return (
    <div aria-busy="true">
      <Skeleton className={cn("rounded-none", heroClassName ?? (panel ? PANEL_HERO : "h-[38vh] min-h-[240px] sm:h-[46vh] sm:max-h-[420px]"))} />
      <div className={cn(pad, "pt-6")}>
        <Skeleton className="h-3.5 w-16 rounded-md" />
        <Skeleton className="mt-3 h-8 w-2/3 rounded-lg" />
        <Skeleton className="mt-3 h-4 w-1/2 rounded-md" />
        <Skeleton className="mt-6 h-11 w-full max-w-md rounded-full" />
        <Skeleton className="mt-6 h-[5.25rem] w-full rounded-2xl" />
        <p role="status" className="mt-6 min-h-5 text-sm text-muted-foreground">
          {phase === 0 ? <span className="sr-only">Loading {what}</span> : phase === 1 ? "Finding the details…" : "Still finding the details — the source is slow today. You can keep chatting meanwhile."}
        </p>
        <SkeletonLines lines={3} className="mt-4" />
        {children}
      </div>
    </div>
  );
}

/** A failed load: says what failed, offers Retry, and never points at a screen the user isn't on. Centred in the panel so a tall column is not a small card and a lot of nothing. */
export function PanelError({ what, panel, onRetry, children }: { what: string; panel: boolean; onRetry?: () => void; children?: ReactNode }) {
  const pad = panel ? PANEL_PAD : "mx-auto max-w-5xl px-5 pb-14 sm:px-8";
  return (
    <div className={cn(pad, "grid min-h-[min(30rem,62vh)] place-items-center pt-10")}>
      <div role="alert" className="mx-auto max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-caution-soft text-caution shadow-hairline">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-xl leading-snug font-medium tracking-[-0.015em]">We couldn’t load {what}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft text-pretty">It didn’t come back this time. That usually clears up on its own.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-primary-sm">
              <RefreshCw className="size-3.5" aria-hidden /> Try again
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
