"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The top of a sheet that has controls at its edges (a form, a detail view): the title sits in the middle, a small eyebrow above it if it
 * helps, the close button on the right (a 40px grey circle: the same one the trip panel uses) and, optionally, something on the left.
 * A sheet with nothing at its edges has no header like this: its title is left-aligned under the grabber (see `PickerSheet`).
 */
export function SheetHeader({ title, eyebrow, onClose, left, bordered = true }: { title: ReactNode; eyebrow?: ReactNode; onClose: () => void; left?: ReactNode; bordered?: boolean }) {
  return (
    <header className={cn("grid shrink-0 grid-cols-[minmax(2.5rem,1fr)_minmax(0,auto)_minmax(2.5rem,1fr)] items-center gap-3 px-4 py-3", bordered && "border-b border-border")}>
      <div className="justify-self-start">{left}</div>
      <div className="min-w-0 text-center">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <p className="truncate font-display text-lg font-medium tracking-[-0.02em]">{title}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center justify-self-end rounded-full bg-muted text-foreground transition-transform duration-150 active:scale-[0.97]">
        <X className="size-4" aria-hidden />
      </button>
    </header>
  );
}
