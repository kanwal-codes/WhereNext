"use client";

import { Car, Loader2, Plane, TrainFront } from "lucide-react";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { durationFromSeconds } from "@/lib/utils";
import { whenLabel } from "@/lib/application/travel-time";
import { cheapestFlight } from "../domain/route-view";
import type { useTransportSearch } from "../application/useTransportSearch";

/** Once a search has run: the Transit | Drive | Flights switch (with each way's headline), and the line of explanation under the one chosen. */
export function TransportTabs({ t }: { t: ReturnType<typeof useTransportSearch> }) {
  const { routes, flights, driveRoute, tab, setTab, transitStatus, driveStatus, flightsStatus, flightsLoading, loadFlights, when, timeNote, searched, loading, queryRef } = t;
  const transitTime = routes.length ? durationFromSeconds(Math.min(...routes.map((r) => r.durationSeconds))) : "";
  const flightFrom = cheapestFlight(flights)?.from ?? null;
  return (
    <>
      {searched && (
        <div className="space-y-4">
          <SegmentedSwitch
            label="Ways to get there"
            className="w-full [&>*]:flex-1"
            value={tab}
            onChange={(k) => {
              setTab(k);
              if (k === "flight") void loadFlights(queryRef.current.a, queryRef.current.b);
            }}
            options={[
              { key: "transit", ariaLabel: `Transit${routes.length ? `, ${transitTime}` : ""}`, label: <><TrainFront className="size-4" aria-hidden="true" />{routes.length ? transitTime : "Transit"}</> },
              { key: "drive", ariaLabel: `Drive${driveRoute ? `, ${durationFromSeconds(driveRoute.durationSeconds)}` : ""}`, label: <><Car className="size-4" aria-hidden="true" />{driveRoute ? durationFromSeconds(driveRoute.durationSeconds) : "Drive"}</> },
              { key: "flight", ariaLabel: `Flights${flightFrom ? `, from ${flightFrom}` : ""}`, label: <><Plane className="size-4" aria-hidden="true" />{flightFrom ?? "Flights"}</> },
            ]}
          />
          {tab === "transit" && routes.length === 0 && !loading && (
            <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">
              {transitStatus || "No public transit route between those two places."}
              {driveRoute ? " Driving is open in the Drive tab." : ""}
            </p>
          )}
          {tab === "transit" && routes.length > 0 && transitStatus && <p className="text-xs text-muted-foreground">{transitStatus}</p>}
          {tab === "transit" && timeNote && <p className="text-xs text-muted-foreground">{timeNote}</p>}
          {tab === "drive" && driveRoute && when?.kind === "arrive" && <p className="text-xs text-muted-foreground">Driving is planned for leaving, not arriving. Choose “Leave at” to see traffic for a time.</p>}
          {tab === "drive" && driveRoute && when?.kind === "depart" && <p className="text-xs text-muted-foreground">Typical traffic for {whenLabel(when).toLowerCase()}.</p>}
          {tab === "drive" && !driveRoute && <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">{driveStatus || "No driving route found between those two places."}</p>}
          {tab === "flight" && flightsLoading && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Looking for flights…
            </p>
          )}
          {tab === "flight" && !flightsLoading && flightsStatus && (flights.length === 0 ? <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">{flightsStatus}</p> : <p className="text-xs text-muted-foreground">{flightsStatus}</p>)}
        </div>
      )}
    </>
  );
}
