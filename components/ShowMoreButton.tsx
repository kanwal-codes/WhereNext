"use client";

import React from "react";
import { ChevronDown, Loader2 } from "lucide-react";

/**
 * The way to the next rows of a list: one quiet "More" button. How many rows it adds is the list's own rule (`useShowMore`: 9 at a
 * time, or what is left); where the reader is in the list goes to screen readers only. `force` keeps the button when the rows in hand
 * are used up but the provider has another page (events).
 */
export function ShowMoreButton({ next, visible, total, onClick, noun = "stays", force = false, busy = false }: { next: number; visible: number; total: number; onClick: () => void; noun?: string; force?: boolean; busy?: boolean }) {
  if (next <= 0 && !force) return null;
  return (
    <div className="flex justify-center pt-2">
      <button type="button" onClick={onClick} disabled={busy} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-6 font-medium shadow-soft transition-[transform,border-color,background-color] hover:border-foreground/30 hover:bg-accent active:scale-[0.97]">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        More <ChevronDown className="size-4" aria-hidden />
      </button>
      <p className="sr-only" role="status" aria-live="polite">Showing {visible} of {total} {noun}</p>
    </div>
  );
}
