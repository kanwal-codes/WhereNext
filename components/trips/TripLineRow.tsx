"use client";

import Link from "next/link";
import { TripCover } from "@/components/trips/TripCover";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/packages/contracts/trip-summary";
import { shortTripTitle } from "@/components/shell/trip-title";
import { cn } from "@/lib/utils";

/** A trip as one small row: a 64px photo, the name, one line under it (when, or how far off) and the "..." menu. The phone's list of trips after the first, and the Past section. */
export function TripLineRow({ trip, line, deleting, onDelete }: { trip: TripSummary; line: string; deleting: boolean; onDelete: () => void }) {
  return (
    <div className={cn("relative transition-opacity", deleting && "opacity-60")}>
      <Link href={`/trips/${trip.id}`} className="flex items-center gap-4 rounded-3xl py-3 pr-14 pl-1.5 transition-colors duration-200 hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <TripCover trip={trip} typeLed={false} className="size-16 shrink-0 rounded-2xl" />
        <span className="min-w-0">
          <span className="line-clamp-1 block font-display text-widget leading-tight font-medium tracking-[-0.02em]">{shortTripTitle(trip.name)}</span>
          {line && <span className="mt-0.5 block truncate text-body text-ink-soft tabular-nums">{line}</span>}
        </span>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} isOwner={trip.is_owner !== false} className="absolute top-1/2 right-2 z-20 -translate-y-1/2" />
    </div>
  );
}
