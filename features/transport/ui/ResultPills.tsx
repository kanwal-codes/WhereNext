"use client";

import { useState } from "react";
import { ArrowDownUp, CalendarClock, CornerDownRight } from "lucide-react";
import { PickerSheet } from "@/components/PickerSheet";
import { todayLocal, whenLabel, type Sort } from "@/lib/application/travel-time";
import type { useTransportSearch } from "../application/useTransportSearch";
import type { RouteSort } from "../domain/route-view";
import { availableFilters } from "@/features/conversation/ui/blocks/FlightFilters";
import { TripOptionsSheet } from "./TripOptions";
import { asWidget } from "./FlightResults";

const TRANSIT_SORTS: ReadonlyArray<{ key: RouteSort; label: string; sub: string }> = [
  { key: "best", label: "Best", sub: "The order they came back in" },
  { key: "fastest", label: "Fastest", sub: "Shortest time first" },
  { key: "changes", label: "Fewer changes", sub: "Fewest times you switch" },
  { key: "walking", label: "Least walking", sub: "Shortest walks first" },
];
const FLIGHT_SORTS: ReadonlyArray<{ key: Sort; label: string; sub: string }> = [
  { key: "best", label: "Best", sub: "Price, time and stops together" },
  { key: "cheapest", label: "Cheapest", sub: "Lowest fare first" },
  { key: "fastest", label: "Fastest", sub: "Shortest flight first" },
  { key: "earliest", label: "Earliest", sub: "Leaves soonest" },
];

const shortDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * The small pills under the ways-to-get-there switch, once a search has run. Each is one thing the open tab can change, and only what that
 * tab really uses: when you leave (every tab), how the results are ordered (Transit, Flights), and the flight-only Non-stop and Return day.
 * The time and the return day open one sheet; the order opens another.
 */
export function ResultPills({ t }: { t: ReturnType<typeof useTransportSearch> }) {
  const { tab, when, setWhen, travellers, setTravellers, returnDate, setReturnDate, trip, sort, setSort, routeSort, setRouteSort, nonstopOnly, setNonstopOnly, changesOnly, setChangesOnly, airport, setAirport, flights: found, flightsAssumed } = t;
  const [sheet, setSheet] = useState<"when" | "sort" | null>(null);
  const flights = tab === "flight";
  const sortable = tab === "transit" || flights;
  const sorts: ReadonlyArray<{ key: string; label: string; sub: string }> = flights ? FLIGHT_SORTS : TRANSIT_SORTS;
  const current = flights ? sort : routeSort;
  const currentLabel = sorts.find((s) => s.key === current)?.label ?? "Best";
  const pill = "btn-chip shrink-0 max-lg:h-10 max-lg:text-sm";
  // Only the filters that would change the list: one every fare passes (or fails) is noise (the same rule as the Roam flights card).
  const available = flights ? availableFilters(found.map(asWidget)) : { airports: [] as string[], nonstop: false, changes: false };

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Options for these results">
        <button type="button" className={pill} onClick={() => setSheet("when")} aria-haspopup="dialog">
          <CalendarClock className="size-4 text-ink-soft" aria-hidden="true" />
          {flights && !when && flightsAssumed ? "Pick a day" : whenLabel(when)}
          {travellers > 1 && <span className="text-muted-foreground">· {travellers} travellers</span>}
        </button>
        {sortable && (
          <button type="button" className={pill} onClick={() => setSheet("sort")} aria-haspopup="dialog">
            <ArrowDownUp className="size-4 text-ink-soft" aria-hidden="true" />
            Sort: {currentLabel}
          </button>
        )}
        {flights && (
          <>
            {available.nonstop && (
              <button type="button" className={pill} aria-pressed={nonstopOnly} onClick={() => setNonstopOnly((v) => !v)}>
                Non-stop
              </button>
            )}
            {available.changes && (
              <button type="button" className={pill} aria-pressed={changesOnly} onClick={() => setChangesOnly((v) => !v)}>
                Changes allowed
              </button>
            )}
            {available.airports.map((a) => (
              <button key={a} type="button" className={pill} aria-pressed={airport === a} onClick={() => setAirport(airport === a ? null : a)}>
                Into {a}
              </button>
            ))}
            <button type="button" className={pill} onClick={() => setSheet("when")} aria-haspopup="dialog">
              <CornerDownRight className="size-4 text-ink-soft" aria-hidden="true" />
              {returnDate ? `Return ${shortDay(returnDate)}` : "Add return"}
            </button>
          </>
        )}
      </div>

      <TripOptionsSheet
        open={sheet === "when"}
        onClose={() => setSheet(null)}
        when={when}
        onWhen={setWhen}
        travellers={travellers}
        onTravellers={setTravellers}
        returnDate={returnDate}
        onReturnDate={setReturnDate}
        showReturn={flights}
        tripDates={trip?.start_date && trip.start_date >= todayLocal() ? { start: trip.start_date, end: trip.end_date } : undefined}
      />

      <PickerSheet
        open={sheet === "sort"}
        onClose={() => setSheet(null)}
        title="Sort by"
        ariaLabel="Sort results"
        value={current}
        onPick={(key) => (flights ? setSort(key as Sort) : setRouteSort(key as RouteSort))}
        options={sorts.map((o) => ({ key: o.key, label: o.label, sub: o.sub }))}
      />
    </>
  );
}
