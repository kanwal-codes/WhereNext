"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Loader2, MapPinOff, Pencil } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { askAssistantHref } from "@/lib/places-ui";
import type { useTransportSearch } from "../application/useTransportSearch";
import { compareContext } from "../domain/route-view";
import { TransportTabs } from "./TransportTabs";
import { DriveResult } from "./DriveResult";
import { FlightResults } from "./FlightResults";
import { TransitResults } from "./TransitResults";

/**
 * What the sheet shows once there is a route: the Transit | Drive | Flights switch, the pills for when and sort, and the results of the open way.
 * The two ends and the search itself live in the pill and its editor; this only draws what that search found.
 */
export function TransportSurface({ tripId, t, driveSlot, onEdit }: {
  tripId: string;
  t: ReturnType<typeof useTransportSearch>;
  /** Shown under a driving result and nowhere else (the rental cars). */
  driveSlot?: ReactNode;
  /** Opens the editor, for "that place wasn't found". */
  onEdit: () => void;
}) {
  const { from, to, routes, flights, driveRoute, when, returnDate, travellers, loading, searched, status } = t;
  const found = routes.length > 0 || flights.length > 0 || Boolean(driveRoute);
  // A search that ends with nothing at all and a reason (a place that could not be found) is a state of its own, not three empty tabs.
  const lost = searched && !loading && !found && Boolean(status);
  return (
    <div className="space-y-6">
      {loading && !found && (
        <div role="status" aria-label="Finding routes" className="space-y-3">
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      )}
      {loading && found && (
        <p role="status" className="-mb-2 flex items-center gap-2 text-sm text-ink-soft">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Finding routes…
        </p>
      )}
      {lost ? (
        <div className="rounded-2xl bg-surface px-5 py-6 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-card text-ink-soft ring-1 ring-border"><MapPinOff className="size-5" aria-hidden="true" /></span>
          <p className="mt-3 font-display text-lg font-medium tracking-[-0.012em]">No route found</p>
          <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-relaxed text-ink-soft">{status}</p>
          <button type="button" onClick={onEdit} className="btn-chip mx-auto mt-4 max-lg:h-10"><Pencil className="size-3.5" aria-hidden="true" />Change places</button>
        </div>
      ) : (
        <>
          <TransportTabs t={t} />
          <DriveResult t={t} />
          {t.tab === "drive" && t.driveRoute && driveSlot}
          <FlightResults t={t} />
          <TransitResults t={t} />
        </>
      )}
      {found && (
        <Link
          href={askAssistantHref(tripId, {
            name: `${from} → ${to}`,
            question: `Compare these ways to get from ${from} to ${to}. Which is fastest, cheapest, and simplest, and what would you pick?`,
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
