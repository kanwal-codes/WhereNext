"use client";

import React, { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A labelled list that folds: the label and a count, a one-line hint while it is folded, and Show / Hide with a
 * chevron. The content stays mounted and folds by grid rows, so it opens and closes without a jump, and is inert
 * (not tabbable, not read out) while folded.
 */
export function Fold({ label, count, hint, defaultOpen = false, variant = "section", children }: { label: string; count?: number; hint?: ReactNode; defaultOpen?: boolean; /** `strip`: the header is a full-width band that hangs off the bottom of the card it sits in (the card supplies the corners and the content comes below it, edge to edge). */ variant?: "section" | "strip"; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const strip = variant === "strip";
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={id} className={cn("group flex w-full items-center gap-2 text-left", strip ? "border-t border-border bg-surface px-5 py-3.5 transition-colors hover:bg-muted/70" : "mb-2 rounded-lg py-1")}>
        <span className="eyebrow shrink-0 whitespace-nowrap">{label}</span>
        {count !== undefined && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium tabular-nums text-ink-soft">{count}</span>}
        {!open && hint && <span className="ml-1 min-w-0 truncate text-xs leading-snug text-muted-foreground">{hint}</span>}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-soft transition-colors group-hover:text-foreground">
          {open ? "Hide" : "Show"}
          <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      <div id={id} inert={!open} className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
