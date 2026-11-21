"use client";

import { type ReactNode } from "react";
import { Check } from "lucide-react";
import { FilterPills, type FilterPill } from "@/components/FilterPills";
import { Sheet } from "@/components/motion-primitives";
import { sheetPrimary } from "@/components/motion/sheetActions";
import { activeEatFilters, DEFAULT_EAT_VIEW, dollars, EAT_SORTS, RATING_STEPS, type availableEat, type EatView } from "@/features/eat/domain/eat-view";
import { CATEGORY_BY_KEY } from "@/features/places/ui/discoverTaxonomy";

const EAT = CATEGORY_BY_KEY.get("eat")!;
const toggled = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const group = (title: string, children: ReactNode) => (
  <section>
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="mt-2.5">{children}</div>
  </section>
);

/**
 * The pills under the Eat header (Open now, Sort, Type, Price, Rating) and the sheet that holds them all, shared by the trip's Eat page and the one
 * with no trip. The type is the one setting that changes the search itself, so it comes in as chosen types and callbacks, not as part of the view.
 */
export function EatFilters({ eat, onChange, subs, onToggleSub, onClearSubs, available, shown, showPills, sheetOpen, onSheetOpen, noType = false, extraPills = [], onClear }: {
  /** Pills of the caller's own, shown first ("Open at 7:30 PM"). */
  extraPills?: FilterPill[];
  /** Runs when everything is cleared, for the caller's own settings. */
  onClear?: () => void;
  /** A search for one named place has no types to choose between. */
  noType?: boolean;
  eat: EatView;
  onChange: (next: EatView) => void;
  subs: string[];
  onToggleSub: (label: string) => void;
  onClearSubs: () => void;
  available: ReturnType<typeof availableEat>;
  /** How many places the filters leave. */
  shown: number;
  showPills: boolean;
  sheetOpen: boolean;
  onSheetOpen: (open: boolean) => void;
}) {
  const set = (patch: Partial<EatView>) => onChange({ ...eat, ...patch });
  const filterCount = activeEatFilters(eat) + (noType ? 0 : subs.length) + extraPills.filter((p) => p.on).length;
  const clearAll = () => { onChange({ ...DEFAULT_EAT_VIEW, sort: eat.sort }); onClearSubs(); onClear?.(); };
  const sortBody = (close?: () => void) => (
    <div className="grid grid-cols-2 gap-2">
      {EAT_SORTS.map((s) => <button key={s.id} type="button" onClick={() => { set({ sort: s.id }); close?.(); }} aria-pressed={eat.sort === s.id} className="btn-chip justify-center">{s.label}</button>)}
    </div>
  );
  const typeBody = () => (
    <div className="flex flex-wrap gap-2">
      {EAT.subs.map((s) => (
        <button key={s.label} type="button" onClick={() => onToggleSub(s.label)} aria-pressed={subs.includes(s.label)} className="btn-chip gap-1.5">
          {subs.includes(s.label) && <Check className="size-3.5" aria-hidden />}{s.label}
        </button>
      ))}
    </div>
  );
  const priceBody = () => (
    <div className="grid grid-cols-4 gap-2">
      {available.prices.map((r) => <button key={r} type="button" onClick={() => set({ prices: toggled(eat.prices, r) })} aria-pressed={eat.prices.includes(r)} className="btn-chip justify-center">{dollars(r)}</button>)}
    </div>
  );
  const ratingBody = () => (
    <div className="flex flex-wrap gap-2">
      {RATING_STEPS.map((r) => <button key={r} type="button" onClick={() => set({ minRating: eat.minRating === r ? null : r })} aria-pressed={eat.minRating === r} className="btn-chip">{r}+</button>)}
    </div>
  );
  const pills: FilterPill[] = [
    ...extraPills,
    ...(available.openNow ? [{ key: "open", label: "Open now", on: eat.openNow, onPress: () => set({ openNow: !eat.openNow }) }] : []),
    { key: "sort", label: `Sort: ${EAT_SORTS.find((s) => s.id === eat.sort)?.label}`, on: eat.sort !== "pick", title: "Sort by", body: sortBody },
    ...(noType ? [] : [{ key: "type", label: subs.length === 1 ? subs[0]! : subs.length > 1 ? `${subs.length} types` : "Type", on: subs.length > 0, title: "Type of place", body: typeBody, clear: onClearSubs }]),
    ...(available.prices.length ? [{ key: "price", label: eat.prices.length ? [...eat.prices].sort().map(dollars).join(", ") : "Price", on: eat.prices.length > 0, title: "Price", body: priceBody, clear: () => set({ prices: [] }) }] : []),
    ...(available.ratings ? [{ key: "rating", label: eat.minRating !== null ? `${eat.minRating}+ stars` : "Rating", on: eat.minRating !== null, title: "Rating", body: ratingBody, clear: () => set({ minRating: null }) }] : []),
  ];
  return (
    <>
      {showPills && <FilterPills pills={pills} filterCount={filterCount} onFilters={() => onSheetOpen(true)} className="pt-1" />}
      <Sheet
        open={sheetOpen}
        onClose={() => onSheetOpen(false)}
        side="bottom"
        ariaLabel="Sort and filter places"
        padded
        footer={shown === 0 ? <button type="button" onClick={clearAll} className={sheetPrimary}>No places match. Clear filters</button> : <button type="button" onClick={() => onSheetOpen(false)} className={sheetPrimary}>Show {shown} {shown === 1 ? "place" : "places"}</button>}
      >
        <div className="flex items-baseline justify-between gap-3 pb-3 pt-1">
          <p className="font-display text-xl font-medium tracking-[-0.02em]">Sort and filter</p>
          {filterCount > 0 && <button type="button" onClick={clearAll} className="-my-2 -mr-2 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft underline underline-offset-2 active:bg-muted">Clear all</button>}
        </div>
        <div className="scrollbar-slim -mx-1 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-1 pb-1">
          {group("Sort by", sortBody())}
          {!noType && group("Type of place", typeBody())}
          {available.prices.length > 0 && group("Price", priceBody())}
          {available.ratings && group("Rating", ratingBody())}
          {available.openNow && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-body">
              <input type="checkbox" checked={eat.openNow} onChange={() => set({ openNow: !eat.openNow })} className="size-5 shrink-0 accent-primary" />
              Open now
            </label>
          )}
        </div>
      </Sheet>
    </>
  );
}
