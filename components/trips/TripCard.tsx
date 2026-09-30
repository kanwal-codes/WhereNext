"use client";

import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { TripCover } from "@/components/trips/TripCover";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/components/trips/types";
import { tripWhen } from "@/lib/trip-dates";
import type { TripStatus } from "@/lib/trip-status";
import { cn } from "@/lib/utils";

/** "In 12 days", "Underway", "Past", "Planning". The dot only appears for a trip that is happening now. */
export function StatusBadge({ status, className }: { status: TripStatus; className?: string }) {
  return (
    // The wording depends on today's date in the viewer's timezone, so it can differ from the server render.
    <span suppressHydrationWarning className={cn("daisy-badge h-7 gap-1.5 border-border/60 bg-background/80 px-3 text-[13px] font-medium text-foreground backdrop-blur", className)}>
      {status.phase === "underway" && <span aria-hidden className="daisy-status daisy-status-success daisy-status-sm" />}
      {status.badge}
    </span>
  );
}

export function TripCard({
  trip,
  status,
  deleting,
  onDelete,
}: {
  trip: TripSummary;
  status: TripStatus;
  deleting: boolean;
  onDelete: () => void;
}) {
  const when = tripWhen(trip.start_date, trip.end_date, trip.duration_days, "Dates not set");
  return (
    <Tactile lift={5} className="group relative h-full has-[details[open]]:z-30">
      <Link
        href={`/trips/${trip.id}`}
        className="daisy-card h-full overflow-hidden border border-border/70 bg-card shadow-soft transition-colors duration-300 group-hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <TripCover trip={trip} className="h-40 sm:h-44">
          {() => <StatusBadge status={status} className="absolute top-4 left-4 z-10" />}
        </TripCover>
        <div className="daisy-card-body gap-0 p-5 pt-4">
          <h3 className="daisy-card-title min-w-0 font-display text-[1.6rem] leading-tight tracking-tight">
            <span className="truncate">{trip.name}</span>
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{trip.destination || "Destination not set"}</span>
          </p>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-4 text-sm">
            <span className="min-w-0 truncate tabular-nums text-ink-soft">{when}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground" title="Travellers">
              <Users className="h-3.5 w-3.5" />
              <span className="tabular-nums">{trip.travelers ?? "-"}</span>
            </span>
          </div>
        </div>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} className="absolute top-3.5 right-3.5 z-20" />
    </Tactile>
  );
}
