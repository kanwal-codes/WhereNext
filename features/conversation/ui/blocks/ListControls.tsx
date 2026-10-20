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

/**
 * A vertical list that keeps one height however many rows the filters leave: the first `rows` rows of the
 * unfiltered list plus a `peek` of the next (the visible part of a row says "scroll"), measured while no
 * filter is active and then held. Fades at whichever edge has more to scroll to.
 * ponytail: the held height is not re-measured while a filter is on; clearing the filter re-measures.
 */
export function ScrollWindow({ children, frozen, resetKey, label, rows = 3, peek = 0.4 }: { children: React.ReactNode; frozen: boolean; resetKey: string; label: string; rows?: number; peek?: number }) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | undefined>();
  const [edges, setEdges] = React.useState({ top: false, bottom: false });

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || frozen) return;
    const measure = () => {
      const kids = [...list.querySelectorAll(":scope > ul > li")] as HTMLElement[];
      if (kids.length === 0) return;
      const visible = kids.slice(0, rows).reduce((sum, el) => sum + el.offsetHeight, 0);
      setHeight(Math.round(visible + (kids.length > rows ? kids[rows].offsetHeight * peek : 0)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [frozen, rows, peek]);

  const updateEdges = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  React.useEffect(updateEdges, [height, children, updateEdges]);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  return (
    <div className="relative">
      <div ref={scrollRef} onScroll={updateEdges} tabIndex={0} role="region" aria-label={label} style={height ? { height } : undefined} className="overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <div ref={listRef}>{children}</div>
      </div>
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-card to-transparent transition-opacity duration-200", edges.top ? "opacity-100" : "opacity-0")} />
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent transition-opacity duration-200", edges.bottom ? "opacity-100" : "opacity-0")} />
    </div>
  );
}

/** A sideways-scrolling region (a wide table) with a fade at whichever edge has more to scroll to. */
export function ScrollX({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });
  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  React.useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  return (
    <div className={cn("relative", className)}>
      <div ref={ref} onScroll={update} tabIndex={0} role="region" aria-label={label} className="overflow-x-auto scrollbar-slim focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        {children}
      </div>
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-28 w-6 bg-gradient-to-r from-card to-transparent transition-opacity duration-200", edges.left ? "opacity-100" : "opacity-0")} />
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent transition-opacity duration-200", edges.right ? "opacity-100" : "opacity-0")} />
    </div>
  );
}
