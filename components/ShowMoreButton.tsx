"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

/** The way to the next few rows of a list: "Show 6 more", with where the reader is in the list under it. */
export function ShowMoreButton({ next, visible, total, onClick, noun = "stays" }: { next: number; visible: number; total: number; onClick: () => void; noun?: string }) {
  if (next <= 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <button type="button" onClick={onClick} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-6 font-medium shadow-soft transition-[transform,border-color,background-color] hover:border-foreground/30 hover:bg-accent active:scale-[0.97]">
        Show {next} more <ChevronDown className="size-4" aria-hidden />
      </button>
      <p className="text-xs text-muted-foreground tabular-nums" role="status" aria-live="polite">Showing {visible} of {total} {noun}</p>
    </div>
  );
}
