"use client";

import React from "react";
import type { FlightOffer } from "@/components/TripPanelProvider";
import { ViewControls, type FilterDef } from "./ListControls";

export type FlightSort = "price" | "duration" | "departure";
export type FlightView = { sort: FlightSort; nonstop: boolean; changes: boolean; airport: string | null };
/** Calendar days between take-off and landing as the clock shows them ("+1", "+2"), 0 for the same day. */
export function arrivalDayOffset(departAt: string, arriveAt: string): number {
  const day = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : NaN;
  };
  const diff = day(arriveAt) - day(departAt);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

export const DEFAULT_FLIGHT_VIEW: FlightView = { sort: "price", nonstop: false, changes: false, airport: null };

const SORTS: Array<{ id: FlightSort; label: string }> = [
  { id: "price", label: "Cheapest" },
  { id: "duration", label: "Fastest" },
  { id: "departure", label: "Earliest" },
];

const allowsChanges = (o: FlightOffer) => Boolean(o.fareConditions?.some((c) => /changes? allowed/i.test(c) && !/not allowed/i.test(c)));

/** The offers a view shows: filtered, then sorted. Ties keep the provider's order. */
export function applyFlightView(items: FlightOffer[], view: FlightView): FlightOffer[] {
  const shown = items.filter((o) => (!view.nonstop || o.stops === 0) && (!view.changes || allowsChanges(o)) && (!view.airport || o.destinationAirport === view.airport));
  const key = (o: FlightOffer) => (view.sort === "price" ? Number(o.price) : view.sort === "duration" ? o.durationMinutes : new Date(o.departAt).getTime());
  return shown.map((o, i) => ({ o, i })).sort((a, b) => key(a.o) - key(b.o) || a.i - b.i).map(({ o }) => o);
}

/** Only the filters that would change what is shown: a filter every flight passes (or fails) is noise. */
export function availableFilters(items: FlightOffer[]) {
  const airports = [...new Set(items.map((o) => o.destinationAirport).filter((a): a is string => Boolean(a)))];
  return {
    airports: airports.length > 1 ? airports : [],
    nonstop: items.some((o) => o.stops === 0) && items.some((o) => o.stops > 0),
    changes: items.some(allowsChanges) && items.some((o) => !allowsChanges(o)),
  };
}

/** Sort and filter for a flights card; the filters shown are only the ones that would change the list. */
export function FlightControls({ items, view, onChange, shown }: { items: FlightOffer[]; view: FlightView; onChange: (v: FlightView) => void; shown: number }) {
  const f = availableFilters(items);
  const filters: FilterDef[] = [];
  if (f.nonstop) filters.push({ id: "nonstop", label: "Nonstop", active: view.nonstop, onToggle: () => onChange({ ...view, nonstop: !view.nonstop }) });
  if (f.changes) filters.push({ id: "changes", label: "Changes allowed", active: view.changes, onToggle: () => onChange({ ...view, changes: !view.changes }) });
  for (const a of f.airports) filters.push({ id: `into:${a}`, label: `Into ${a}`, active: view.airport === a, onToggle: () => onChange({ ...view, airport: view.airport === a ? null : a }) });
  return (
    <ViewControls
      label="flights"
      noun="flights"
      sorts={SORTS}
      sort={view.sort}
      onSort={(id) => onChange({ ...view, sort: id as FlightSort })}
      filters={filters}
      shown={shown}
      total={items.length}
      onClear={() => onChange({ ...DEFAULT_FLIGHT_VIEW, sort: view.sort })}
    />
  );
}
