"use client";

import React from "react";
import { SlidingTabs } from "./SlidingTabs";
import { controlSecondary, type } from "./ui";
import { cn } from "@/lib/utils";

export type SortDef = { id: string; label: string };
export type FilterDef = { id: string; label: string; active: boolean; onToggle: () => void };

const chip = (on: boolean) => cn(controlSecondary, "h-8", on && "border-primary bg-primary text-primary-foreground hover:border-primary hover:text-primary-foreground");

/**
 * Sort and filter for any list card: a segmented "Sort by" control, filter chips, "Clear", and a live count.
 * A card passes only the sorts and filters that would change what it shows; this renders nothing when there
 * is nothing to choose between.
 */
export function ViewControls({ label, noun, sorts, sort, onSort, filters, shown, total, onClear, bordered = true, trailing }: {
  label: string;
  noun: string;
  sorts: SortDef[];
  sort: string;
  onSort: (id: string) => void;
  filters: FilterDef[];
  shown: number;
  total: number;
  onClear: () => void;
  bordered?: boolean;
  /** Sits at the right edge of the sort row (a "See all" for the list these controls order). */
  trailing?: React.ReactNode;
}) {
  const active = filters.some((f) => f.active);
  if (total < 2 || (sorts.length < 2 && filters.length === 0)) return null;
  return (
    <div className={cn("space-y-3", bordered && "border-b border-border px-4 py-3")}>
      {sorts.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={type.meta}>Sort by</span>
          <SlidingTabs
            label={`Sort ${label}`}
            className="daisy-tabs-sm"
            value={sort}
            onChange={onSort}
            items={sorts.map((s) => ({ key: s.id, content: <span>{s.label}</span> }))}
          />
          {trailing && <span className="ml-auto">{trailing}</span>}
        </div>
      )}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Filter ${label}`}>
          {filters.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.active} onClick={f.onToggle} className={chip(f.active)}>{f.label}</button>
          ))}
          {active && (
            <button type="button" onClick={onClear} className="relative text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
              Clear
            </button>
          )}
          <p role="status" aria-live="polite" className={cn(type.meta, "ml-auto tabular-nums", !active && "sr-only")}>
            {shown === total ? `${total} ${noun}` : `Showing ${shown} of ${total}`}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Keeps a region at the largest height it had while nothing was filtered, so the card never shrinks under
 * the controls. ponytail: not re-measured while a filter is on; clearing the filter re-measures.
 */
export function HoldHeight({ frozen, children, className }: { frozen: boolean; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [min, setMin] = React.useState<number | undefined>();
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || frozen) return;
    // Read the natural height with the hold released, then hold it.
    const measure = () => {
      el.style.minHeight = "";
      setMin(Math.round(el.getBoundingClientRect().height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frozen]);
  return <div ref={ref} style={min ? { minHeight: min } : undefined} className={className}>{children}</div>;
}
