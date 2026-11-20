"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** One pill under a header. Unset it shows the group's name; set it shows its value (see docs/design/LANGUAGE.md). */
export type FilterPill = {
  key: string;
  label: string;
  /** Is it set? A set pill looks pressed. */
  on: boolean;
  /** The panel it opens: a title and the controls. A pill with no `body` is a plain toggle (`onPress`). */
  title?: string;
  body?: (close: () => void) => ReactNode;
  /** Puts this group back to its default; shown as "Clear" in the panel while it is set. */
  clear?: () => void;
  onPress?: () => void;
};

/**
 * The row of pills under a screen's header: "Filters" first (it opens the whole sheet), then one pill for each setting that would change the list. A
 * pill with controls opens them in a small panel that floats over the list (nothing underneath moves); a tap outside, Escape or the cross closes it.
 */
export function FilterPills({ pills, filterCount, onFilters, label = "Sort and filter", className }: { pills: FilterPill[]; filterCount: number; onFilters: () => void; label?: string; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("pointerdown", away); };
  }, [open]);
  const current = pills.find((p) => p.key === open && p.body) ?? null;
  return (
    <div ref={ref} className={cn("relative", className)}>
      <div role="group" aria-label={label} className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4">
        <button type="button" onClick={onFilters} aria-haspopup="dialog" aria-pressed={filterCount > 0} className="btn-chip shrink-0 gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
        </button>
        {pills.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => (p.body ? setOpen((cur) => (cur === p.key ? null : p.key)) : p.onPress?.())}
            aria-expanded={p.body ? open === p.key : undefined}
            aria-pressed={p.on}
            className="btn-chip shrink-0 gap-1.5"
          >
            {p.label}
            {p.body && <ChevronDown className={cn("size-3.5 opacity-60 transition-transform duration-200", open === p.key && "rotate-180")} aria-hidden />}
          </button>
        ))}
      </div>
      {current && (
        <div role="region" aria-label={current.title} className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl bg-card p-4 shadow-lift ring-1 ring-border">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{current.title}</h3>
            <div className="-mr-2 flex items-center gap-1">
              {current.on && current.clear && <button type="button" onClick={current.clear} className="rounded-full px-2.5 py-1.5 text-sm font-medium text-ink-soft underline underline-offset-2 active:bg-muted">Clear</button>}
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted"><X className="size-4" aria-hidden /></button>
            </div>
          </div>
          <div className="mt-3">{current.body!(() => setOpen(null))}</div>
        </div>
      )}
    </div>
  );
}
