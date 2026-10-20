"use client";

import Link from "next/link";
import { TripCover } from "@/components/trips/TripCover";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/components/trips/types";
import { shortTripTitle } from "@/components/shell/trip-title";
import { tripWhen } from "@/lib/trip-dates";
import type { TripStatus } from "@/lib/trip-status";
import { cn } from "@/lib/utils";

/**
 * A trip on a phone's home screen: its cover (the destination photo, or the type-led pass when there is none) with how far off it is,
 * then the name and the dates beneath. Desktop keeps the photographic cards. The "..." menu is the same one the cards use.
 */
export function PhoneTripRow({ trip, status, deleting, onDelete }: { trip: TripSummary; status: TripStatus; deleting: boolean; onDelete: () => void }) {
  const when = tripWhen(trip.start_date, trip.end_date, trip.duration_days, "Dates not set");
  const title = shortTripTitle(trip.name);
  const travellers = trip.travelers ? `${trip.travelers} ${trip.travelers === 1 ? "traveller" : "travellers"}` : null;
  return (
    <div className={cn("relative transition-transform duration-200 active:scale-[0.985]", deleting && "opacity-60")}>
      <Link href={`/trips/${trip.id}`} className="block rounded-4xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`${trip.name}. ${status.badge}`}>
        <TripCover trip={trip} className="h-44 rounded-4xl">
          {() => (
            <span suppressHydrationWarning className="photo-chip absolute top-3.5 left-3.5 z-10 gap-1.5">
              {status.phase === "underway" ? <span aria-hidden className="daisy-status daisy-status-success daisy-status-sm" /> : <span aria-hidden className="size-1.5 rounded-full bg-coral" />}
              {status.badge}
            </span>
          )}
        </TripCover>
        <span className="mt-3 block px-1">
          <span className="line-clamp-2 block font-display text-widget leading-tight font-medium tracking-[-0.025em]">{title}</span>
          <span className="mt-1 block truncate text-[0.9375rem] text-ink-soft tabular-nums">{[when, travellers].filter(Boolean).join(" · ")}</span>
        </span>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} isOwner={trip.is_owner !== false} className="absolute top-2.5 right-2.5 z-20" />
    </div>
  );
}
