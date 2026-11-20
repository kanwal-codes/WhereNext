"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { sheetPrimary } from "@/components/motion/sheetActions";
import type { FlightOffer } from "@/components/TripPanelProvider";
import { airportNames, ALL_SORTS, activeFlightFilters, availableFilters, DEFAULT_FLIGHT_VIEW, facetCounts, TIMES_OF_DAY, type FlightView } from "@/features/conversation/ui/blocks/FlightFilters";
import { SlidingTabs } from "@/features/conversation/ui/blocks/SlidingTabs";
import { money } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";

const toggled = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
/** Airlines shown before "Show all": enough to cover the usual search, few enough that the groups below stay in view. */
const AIRLINES_SHOWN = 6;

/** The groups of settings: each has a pill under the header that opens it in place, and all of them are in the sheet. */
export type FilterSection = "sort" | "stops" | "price" | "times" | "airlines" | "airports";
export const SECTION_TITLES: Record<FilterSection, string> = { sort: "Sort by", stops: "Stops", price: "Price", times: "Departure time", airlines: "Airlines", airports: "Arrival airport" };

/** The groups that would change this list (Sort always does): a list of near-identical flights gets just Sort. */
function availableSections(items: FlightOffer[]): FilterSection[] {
  const f = availableFilters(items);
  return ["sort", ...(f.nonstop || f.stops1 ? ["stops" as const] : []), ...(f.price ? ["price" as const] : []), ...(f.times.length ? ["times" as const] : []), ...(f.airlines.length ? ["airlines" as const] : []), ...(f.airports.length ? ["airports" as const] : [])];
}

/** Is anything in this group changed from its default? */
export function sectionActive(v: FlightView, s: FilterSection): boolean {
  switch (s) {
    case "sort": return v.sort !== DEFAULT_FLIGHT_VIEW.sort;
    case "stops": return v.nonstop || v.stops1;
    case "price": return v.maxPrice !== null;
    case "times": return v.times.length > 0;
    case "airlines": return v.airlines.length > 0;
    case "airports": return v.airport !== null;
  }
}

/** The view with this group put back to its default. */
export function clearSection(v: FlightView, s: FilterSection): FlightView {
  switch (s) {
    case "sort": return { ...v, sort: DEFAULT_FLIGHT_VIEW.sort };
    case "stops": return { ...v, nonstop: false, stops1: false };
    case "price": return { ...v, maxPrice: null };
    case "times": return { ...v, times: [] };
    case "airlines": return { ...v, airlines: [] };
    case "airports": return { ...v, airport: null };
  }
}

/** A section: its title (with what it is doing at the right, when it has something to say), then its controls. */
function Group({ id, title, aside, children }: { id: FilterSection; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={`flight-filter-${id}`}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <h3 className="font-semibold">{title}</h3>
        {aside && <span className="text-muted-foreground tabular-nums">{aside}</span>}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** One option: pick-many options are chips with a tick when on; one that would leave no flights is dimmed (and cannot be pressed). */
function Chip({ label, empty, on, onClick }: { label: string; empty: boolean; on: boolean; onClick: () => void }) {
  const dim = empty && !on;
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={dim} className={cn("btn-chip gap-1.5", dim && "opacity-40")}>
      {on && <Check className="size-3.5" aria-hidden />}
      <span>{label}</span>
    </button>
  );
}

/**
 * The controls of one group, the same in the sheet and in the small panel a pill opens. Sort and Stops are choose-one (a grid of buttons, a sliding
 * switch); departure time, airlines and airports are choose-many (chips that tick); price is a slider. Choices apply at once.
 */
export function SectionBody({ section, items, view, onChange, currency }: { section: FilterSection; items: FlightOffer[]; view: FlightView; onChange: (next: FlightView) => void; currency: string | null }) {
  const f = useMemo(() => availableFilters(items), [items]);
  const names = useMemo(() => airportNames(items), [items]);
  const counts = useMemo(() => facetCounts(items, view), [items, view]);
  const [allAirlines, setAllAirlines] = useState(false);
  const set = (patch: Partial<FlightView>) => onChange({ ...view, ...patch });
  switch (section) {
    case "sort":
      return (
        <div className="grid grid-cols-2 gap-2">
          {ALL_SORTS.map((s) => <button key={s.id} type="button" onClick={() => set({ sort: s.id })} aria-pressed={view.sort === s.id} className="btn-chip justify-center px-2">{s.label}</button>)}
        </div>
      );
    case "stops":
      return (
        <SlidingTabs
          label="Stops"
          className="w-full [&>button]:flex-1"
          value={view.nonstop ? "nonstop" : view.stops1 ? "one" : "any"}
          onChange={(k) => set({ nonstop: k === "nonstop", stops1: k === "one" })}
          items={[
            { key: "any", content: <span>Any</span> },
            ...(f.nonstop ? [{ key: "nonstop", content: <span>Nonstop</span> }] : []),
            ...(f.stops1 ? [{ key: "one", content: <span>Up to 1 stop</span> }] : []),
          ]}
        />
      );
    case "price":
      return f.price ? (
        <div>
          <p className="mb-1 text-sm text-muted-foreground tabular-nums">{view.maxPrice !== null ? `Up to ${currency ? money(String(view.maxPrice), currency, true) : view.maxPrice}` : "Any price"}</p>
          <input
            type="range"
            aria-label="Highest price"
            min={f.price.min}
            max={f.price.max}
            step={Math.max(1, Math.round((f.price.max - f.price.min) / 40))}
            value={view.maxPrice ?? f.price.max}
            onChange={(e) => set({ maxPrice: Number(e.target.value) >= f.price!.max ? null : Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      ) : null;
    case "times":
      return (
        <div className="grid grid-cols-3 gap-2">
          {TIMES_OF_DAY.filter((t) => f.times.includes(t.id)).map((t) => {
            const on = view.times.includes(t.id);
            const dim = counts.times[t.id] === 0 && !on;
            return (
              <button key={t.id} type="button" onClick={() => set({ times: toggled(view.times, t.id) })} aria-pressed={on} disabled={dim} className={cn("btn-chip h-auto flex-col gap-0.5 rounded-2xl px-2 py-2.5", dim && "opacity-40")}>
                <span className="inline-flex items-center gap-1.5">{on && <Check className="size-3.5" aria-hidden />}{t.label}</span>
                <span className="text-xs font-normal text-muted-foreground">{t.range}</span>
              </button>
            );
          })}
        </div>
      );
    case "airlines": {
      const shown = allAirlines ? f.airlines : f.airlines.slice(0, AIRLINES_SHOWN);
      return (
        <>
          <div className="flex flex-wrap gap-2">
            {shown.map((a) => <Chip key={a} label={a} empty={counts.airline(a) === 0} on={view.airlines.includes(a)} onClick={() => set({ airlines: toggled(view.airlines, a) })} />)}
          </div>
          {f.airlines.length > AIRLINES_SHOWN && (
            <button type="button" onClick={() => setAllAirlines((v) => !v)} className="mt-2.5 -ml-1 rounded-full px-1 py-1 text-sm font-medium text-ink-soft underline underline-offset-2">{allAirlines ? "Show fewer" : `Show all ${f.airlines.length}`}</button>
          )}
        </>
      );
    }
    case "airports":
      return (
        <div className="flex flex-wrap gap-2">
          {f.airports.map((a) => <Chip key={a} label={names[a] ? `${names[a]} · ${a}` : a} empty={counts.airport(a) === 0} on={view.airport === a} onClick={() => set({ airport: view.airport === a ? null : a })} />)}
        </div>
      );
  }
}

/**
 * All the groups together, in a sheet from the bottom: opened by the "Filters" pill. Only a group that would change the list is shown. Choices apply
 * at once; the footer says how many flights they leave.
 */
export function FlightFilterSheet({ open, onClose, items, view, onChange, shown, currency }: {
  open: boolean;
  onClose: () => void;
  items: FlightOffer[];
  view: FlightView;
  onChange: (next: FlightView) => void;
  shown: number;
  currency: string | null;
}) {
  const f = useMemo(() => availableFilters(items), [items]);
  const sections = useMemo(() => availableSections(items), [items]);
  const active = activeFlightFilters(view);
  const set = (patch: Partial<FlightView>) => onChange({ ...view, ...patch });
  const clear = () => onChange({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort });
  const check = (label: string, on: boolean, toggle: () => void) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-body">
      <input type="checkbox" checked={on} onChange={toggle} className="size-5 shrink-0 accent-primary" />
      {label}
    </label>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="bottom"
      ariaLabel="Sort and filter flights"
      padded
      footer={
        shown === 0
          ? <button type="button" onClick={clear} className={sheetPrimary}>No flights match. Clear filters</button>
          : <button type="button" onClick={onClose} className={sheetPrimary}>Show {shown} {shown === 1 ? "flight" : "flights"}</button>
      }
    >
      <div className="flex items-baseline justify-between gap-3 pb-3 pt-1">
        <p className="font-display text-xl font-medium tracking-[-0.02em]">Sort and filter</p>
        {active > 0 && <button type="button" onClick={clear} className="-my-2 -mr-2 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft underline underline-offset-2 active:bg-muted">Clear all</button>}
      </div>
      <div className="scrollbar-slim -mx-1 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-1 pb-1">
        {sections.map((s) => (
          <Group key={s} id={s} title={SECTION_TITLES[s]}>
            <SectionBody section={s} items={items} view={view} onChange={onChange} currency={currency} />
          </Group>
        ))}
        {(f.layovers || f.changes) && (
          <div className="space-y-2">
            {f.layovers && check("No long layovers", view.layovers, () => set({ layovers: !view.layovers }))}
            {f.changes && check("Changes allowed", view.changes, () => set({ changes: !view.changes }))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
