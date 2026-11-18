"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one control that starts and shows a route. At rest it is a search ("Where to?"); once there is a route, or half of one, it shows the two ends
 * on two lines (the coral dot and the ink square the editor uses) with a hairline of progress while the routes load. Pressing it opens the editor.
 * It only draws what it is told, so the phone header can keep it as a stable node.
 */
export function RoutePill({ from, to, loading, onOpen, className }: { from: string; to: string; loading: boolean; onOpen: () => void; className?: string }) {
  const empty = !from && !to;
  const city = (place: string) => place.split(",")[0]!.trim();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={empty ? "Where to? Search for a route" : `Route from ${from || "…"} to ${to || "…"}. Edit`}
      className={cn(
        "relative flex h-11 w-fit max-w-full min-w-0 items-center overflow-hidden rounded-full bg-muted px-5 text-center transition-transform active:scale-[0.985]",
        empty ? "min-w-[11rem] gap-2.5" : "min-w-[8.5rem]",
        className,
      )}
    >
      {empty ? (
        <>
          <Search className="size-[1.125rem] shrink-0 text-ink-soft" aria-hidden="true" />
          <span className="truncate font-display text-body font-semibold tracking-[-0.01em] text-ink-soft">Where to?</span>
        </>
      ) : (
        // The place you are going is the line that matters: large and bold. Where you leave from is the quiet line above it (no "From": the two lines read as a route).
        <span className="grid min-w-0 flex-1 justify-items-center">
          <span className="truncate text-[0.6875rem] font-normal leading-3.5 tracking-[0.01em] text-ink-soft">{from ? city(from) : "Add a start"}</span>
          <span className={cn("truncate font-display text-[0.9375rem] font-semibold leading-[1.15rem] tracking-[-0.012em]", !to && "font-medium text-muted-foreground")}>{to ? city(to) : "Where to?"}</span>
        </span>
      )}
      {loading && (
        <span aria-hidden="true" className="stay-progress absolute inset-x-5 bottom-0 h-0.5 overflow-hidden rounded-full">
          <span className="stay-progress-bar" />
        </span>
      )}
    </button>
  );
}

/** The round ✕ that takes the route away and puts the trip back (the same 44px grey circle as the menu button beside the pill). */
export function ClearRoute({ onClear, className }: { onClear: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClear} aria-label="Clear the route" className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-transform duration-200 ease-out active:scale-[0.97]", className)}>
      <X className="size-[1.125rem]" aria-hidden="true" />
    </button>
  );
}
