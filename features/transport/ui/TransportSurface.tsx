"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import type { MapLeg } from "@/components/TripMap";
import { type MapOverlay } from "@/lib/application/route-overlay";
import { askAssistantHref } from "@/lib/places-ui";
import { useTransportSearch, type TransportPreset } from "../application/useTransportSearch";
import { compareContext } from "../domain/route-view";
import { RouteSearchForm } from "./RouteSearchForm";
import { TransportTabs } from "./TransportTabs";
import { DriveResult } from "./DriveResult";
import { FlightResults } from "./FlightResults";
import { TransitResults } from "./TransitResults";

export function TransportSurface({
  tripId,
  preset,
  onRoute,
  searchSlot,
  near,
}: {
  tripId: string;
  /** `[lng, lat]` of the trip's area: suggestions as you type are ranked toward it. */
  near?: [number, number];
  /** A search pushed in from outside (e.g. the AI bar). Bump `nonce` to run it. */
  preset?: TransportPreset;
  /** Called with the map legs for the chosen route (or null when cleared). */
  onRoute?: (legs: MapLeg[] | null, overlay?: MapOverlay) => void;
  /** An alternative way to fill in From/To (e.g. a natural-language ask bar), shown above the form in the same card. */
  searchSlot?: ReactNode;
}) {
  const t = useTransportSearch({ tripId, preset, onRoute });
  const { from, to, routes, flights, driveRoute, when, returnDate, travellers } = t;
  return (
    <div className="space-y-7">
      <RouteSearchForm tripId={tripId} near={near} searchSlot={searchSlot} t={t} />
      <TransportTabs t={t} />
      <DriveResult t={t} />
      <FlightResults t={t} />
      <TransitResults t={t} />
      {(routes.length > 0 || flights.length > 0 || driveRoute) && (
        <Link
          href={askAssistantHref(tripId, {
            name: `${from} → ${to}`,
            question: `Compare these ways to get from ${from} to ${to} — which is fastest, cheapest, and simplest, and what would you pick?`,
            context: compareContext({ from, to, when, returnDate, travellers, routes, driveRoute, flights }),
          })}
          className="btn-secondary w-full"
        >
          Ask Roam to compare these
        </Link>
      )}

    </div>
  );
}
