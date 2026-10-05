"use client";

import React from "react";
import { ChevronDown, Loader2 } from "lucide-react";

/** The way to the next few rows of a list: "Show 6 more", with where the reader is in the list under it. */
export function ShowMoreButton({ next, visible, total, onClick, noun = "stays", label, busy = false }: { next: number; visible: number; total: number; onClick: () => void; noun?: string; /** Replaces "Show N more" (a list the provider pages one request at a time). */ label?: string; busy?: boolean }) {
  if (next <= 0 && !label) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <button type="button" onClick={onClick} disabled={busy} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-6 font-medium shadow-soft transition-[transform,border-color,background-color] hover:border-foreground/30 hover:bg-accent active:scale-[0.97]">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {label ?? `Show ${next} more`} <ChevronDown className="size-4" aria-hidden />
      </button>
      <p className="text-xs text-muted-foreground tabular-nums" role="status" aria-live="polite">Showing {visible}{label ? "" : ` of ${total}`} {noun}</p>
    </div>
  );
}
