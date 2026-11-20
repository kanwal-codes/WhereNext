"use client";

import React from "react";
import type { FlightOffer } from "@/components/TripPanelProvider";
import { offerRisks } from "@/lib/application/flight-risks";
import { ViewControls, type FilterDef } from "./ListControls";

export type FlightSort = "price" | "price_desc" | "duration" | "stops" | "departure" | "departure_desc";
/** When a flight leaves, by the clock where it leaves: before noon, noon to six, and six onward (the night flights too). */
export type TimeOfDay = "morning" | "afternoon" | "evening";
export const TIMES_OF_DAY: Array<{ id: TimeOfDay; label: string; range: string }> = [{ id: "morning", label: "Morning", range: "5am to noon" }, { id: "afternoon", label: "Afternoon", range: "Noon to 6pm" }, { id: "evening", label: "Evening", range: "After 6pm" }];
export type FlightView = { sort: FlightSort; nonstop: boolean; changes: boolean; airport: string | null; stops1: boolean; times: TimeOfDay[]; airlines: string[]; layovers: boolean; maxPrice: number | null };
/** Calendar days between take-off and landing as the clock shows them ("+1", "+2"), 0 for the same day. */
export function arrivalDayOffset(departAt: string, arriveAt: string): number {
  const day = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : NaN;
  };
  const diff = day(arriveAt) - day(departAt);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

export const DEFAULT_FLIGHT_VIEW: FlightView = { sort: "price", nonstop: false, changes: false, airport: null, stops1: false, times: [], airlines: [], layovers: false, maxPrice: null };

/** Every sort the phone sheet offers; the inline bar keeps the three people reach for first. */
export const ALL_SORTS: Array<{ id: FlightSort; label: string }> = [
  { id: "price", label: "Lowest price" },
  { id: "price_desc", label: "Highest price" },
  { id: "duration", label: "Fastest" },
  { id: "stops", label: "Fewest stops" },
  { id: "departure", label: "Earliest departure" },
  { id: "departure_desc", label: "Latest departure" },
];

const SORTS: Array<{ id: FlightSort; label: string }> = [
  { id: "price", label: "Cheapest" },
  { id: "duration", label: "Fastest" },
  { id: "departure", label: "Earliest" },
];

const allowsChanges = (o: FlightOffer) => Boolean(o.fareConditions?.some((c) => /changes? allowed/i.test(c) && !/not allowed/i.test(c)));

const hourOf = (iso: string) => Number(iso.slice(11, 13));
const timeOfDay = (iso: string): TimeOfDay => {
  const h = hourOf(iso);
  return h >= 5 && h < 12 ? "morning" : h >= 12 && h < 18 ? "afternoon" : "evening";
};
/** The airlines on a fare: "Air Canada · United" is two, so a filter on Air Canada keeps it. */
export const carriersOf = (o: FlightOffer) => [...new Set(o.airline.split(/\s+·\s+/).map((c) => c.replace(/\s*\+\s*\d+\s+more$/i, "").trim()).filter(Boolean))];
const hasLongLayover = (o: FlightOffer) => offerRisks(o.legs).some((r) => /layover/i.test(r) && !/tight/i.test(r));

/** The offers a view shows: filtered, then sorted. Ties keep the provider's order. */
export function applyFlightView(items: FlightOffer[], view: FlightView): FlightOffer[] {
  const shown = items.filter((o) =>
    (!view.nonstop || o.stops === 0) &&
    (!view.stops1 || o.stops <= 1) &&
    (!view.changes || allowsChanges(o)) &&
    (!view.airport || o.destinationAirport === view.airport) &&
    (view.times.length === 0 || view.times.includes(timeOfDay(o.departAt))) &&
    (view.airlines.length === 0 || carriersOf(o).some((c) => view.airlines.includes(c))) &&
    (!view.layovers || !hasLongLayover(o)) &&
    (view.maxPrice === null || Number(o.price) <= view.maxPrice));
  const when = (o: FlightOffer) => new Date(o.departAt).getTime();
  const key = (o: FlightOffer) => {
    switch (view.sort) {
      case "price": return Number(o.price);
      case "price_desc": return -Number(o.price);
      case "duration": return o.durationMinutes;
      case "stops": return o.stops * 1e9 + Number(o.price);
      case "departure_desc": return -when(o);
      default: return when(o);
    }
  };
  return shown.map((o, i) => ({ o, i })).sort((a, b) => key(a.o) - key(b.o) || a.i - b.i).map(({ o }) => o);
}

/** Airport codes with the names the fares carry for them ("NRT" is "Narita"), for anywhere a bare code would not mean anything to a traveller. */
export function airportNames(items: FlightOffer[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const o of items) {
    for (const l of o.legs ?? []) {
      if (l.to && l.toName) names[l.to] ??= l.toName.replace(/\s+(International\s+)?Airport$/i, "");
      if (l.from && l.fromName) names[l.from] ??= l.fromName.replace(/\s+(International\s+)?Airport$/i, "");
    }
  }
  return names;
}

/** How many of a view's filters are on (the sort is not a filter). */
export const activeFlightFilters = (v: FlightView) => Number(v.nonstop) + Number(v.stops1) + Number(v.changes) + Number(v.airport !== null) + v.times.length + v.airlines.length + Number(v.layovers) + Number(v.maxPrice !== null);

/**
 * How many flights each option would leave, for the sheet: each count is taken with that group's own choice cleared (picking Nonstop shows how many
 * nonstops there are under the other filters, not under itself), so an option that would leave none can be dimmed before it is pressed.
 */
export function facetCounts(items: FlightOffer[], view: FlightView) {
  const n = (patch: Partial<FlightView>) => applyFlightView(items, { ...view, ...patch }).length;
  return {
    stops: { any: n({ nonstop: false, stops1: false }), nonstop: n({ nonstop: true, stops1: false }), stops1: n({ stops1: true, nonstop: false }) },
    times: Object.fromEntries(TIMES_OF_DAY.map((t) => [t.id, n({ times: [t.id] })])) as Record<TimeOfDay, number>,
    airline: (a: string) => n({ airlines: [a] }),
    airport: (a: string) => n({ airport: a }),
  };
}

/** Only the filters that would change what is shown: a filter every flight passes (or fails) is noise. */
export function availableFilters(items: FlightOffer[]) {
  const airports = [...new Set(items.map((o) => o.destinationAirport).filter((a): a is string => Boolean(a)))];
  const airlines = [...new Set(items.flatMap(carriersOf))];
  const times = TIMES_OF_DAY.map((t) => t.id).filter((id) => items.some((o) => timeOfDay(o.departAt) === id));
  const prices = items.map((o) => Number(o.price)).filter((n) => Number.isFinite(n));
  return {
    airports: airports.length > 1 ? airports : [],
    nonstop: items.some((o) => o.stops === 0) && items.some((o) => o.stops > 0),
    stops1: items.some((o) => o.stops > 1) && items.some((o) => o.stops <= 1),
    changes: items.some(allowsChanges) && items.some((o) => !allowsChanges(o)),
    times: times.length > 1 ? times : [],
    airlines: airlines.length > 1 ? airlines : [],
    layovers: items.some(hasLongLayover) && items.some((o) => !hasLongLayover(o)),
    price: prices.length > 1 && Math.max(...prices) > Math.min(...prices) ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) } : null,
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
