"use client";

import { ChevronDown } from "lucide-react";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import { AirlineMark } from "@/features/conversation/ui/panels/OtherFlights";
import { arrangeFlights, fitsTime } from "@/lib/application/travel-time";
import { cn, formatDuration } from "@/lib/utils";
import type { useTransportSearch } from "../application/useTransportSearch";
import { flightClock, flightPrice, flightSaveValue, googleFlightsUrl, stopsLabel } from "../domain/route-view";
import { FlightDetails } from "./FlightDetails";

/** The Flights tab: sort and filter chips, the time filter note, and each offer as an expandable card with Save and View on Google Flights. */
export function FlightResults({ t }: { t: ReturnType<typeof useTransportSearch> }) {
  const { flights, tab, flightsLoading, when, sort, setSort, nonstopOnly, setNonstopOnly, anyTime, setAnyTime, openFlight, setOpenFlight, returnDate, travellers, saveChoice } = t;
  const onTime = flights.filter((f) => anyTime || fitsTime(f, when));
  const shownFlights = arrangeFlights(onTime, sort, nonstopOnly);
  return (
    <>
      {tab === "flight" && !flightsLoading && flights.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sort and filter flights">
            {(["best", "cheapest", "fastest", "earliest"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} className="btn-chip capitalize">
                {k}
              </button>
            ))}
            <button type="button" aria-pressed={nonstopOnly} onClick={() => setNonstopOnly((v) => !v)} className="btn-chip">
              Non-stop
            </button>
          </div>
          {when && !anyTime && onTime.length < flights.length && (
            <p className="text-xs text-muted-foreground">
              Showing flights {when.kind === "depart" ? "leaving after" : "landing by"} {when.time}.{" "}
              <button type="button" onClick={() => setAnyTime(true)} className={cn(textAction, "text-xs underline")}>
                Show all {flights.length}
              </button>
            </p>
          )}
          {shownFlights.length === 0 && <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">No flights match those filters. Try another time, or turn off Non-stop.</p>}
        </div>
      )}

      {tab === "flight" && !flightsLoading && shownFlights.length > 0 && (
        <ul className="space-y-3">
          {shownFlights.map((f, i) => {
            const price = flightPrice(f);
            const id = f.id || String(i);
            const open = openFlight === id;
            const via = f.layoverAirports?.length ? ` via ${f.layoverAirports.join(", ")}` : "";
            return (
              <li key={id} className={cn("rounded-2xl bg-card transition-shadow duration-200", open ? "shadow-lift ring-[1.5px] ring-ink" : "ring-1 ring-border hover:ring-input")}>
                <button type="button" onClick={() => setOpenFlight(open ? null : id)} aria-expanded={open} className="block w-full rounded-2xl p-4 text-left">
                  <span className="flex items-center gap-3">
                    <AirlineMark offer={f} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-medium">{f.airline}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{formatDuration(f.durationMinutes)} · {f.stops === 0 ? "non-stop" : `${stopsLabel(f.stops)}${via}`}{f.returnLegs?.length || returnDate ? " · round-trip fare" : ""}</span>
                    </span>
                    <span className="font-display text-xl font-medium tabular-nums tracking-[-0.012em]">{price}</span>
                  </span>
                  {f.departAt && f.arriveAt && (
                    <span className="mt-3.5 flex items-center justify-between gap-3 text-sm tabular-nums">
                      <span>
                        <span className="font-semibold">{flightClock(f.departAt)}</span>
                        {f.originAirport && <span className="ml-1.5 text-muted-foreground">{f.originAirport}</span>}
                      </span>
                      <span aria-hidden="true" className="h-px flex-1 bg-border" />
                      <span className="text-right">
                        <span className="font-semibold">{flightClock(f.arriveAt)}</span>
                        {f.destinationAirport && <span className="ml-1.5 text-muted-foreground">{f.destinationAirport}</span>}
                      </span>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} aria-hidden="true" />
                    </span>
                  )}
                </button>
                {open && <FlightDetails flight={f} travellers={travellers} />}
                <div className="flex gap-2 px-4 pb-4 pt-1">
                  <button
                    type="button"
                    onClick={() => void saveChoice(flightSaveValue(f, price))}
                    className="btn-chip"
                  >
                    Save to my trip
                  </button>
                  <a href={googleFlightsUrl(f, returnDate)} target="_blank" rel="noopener noreferrer" className="btn-primary-sm">
                    View on Google Flights
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
