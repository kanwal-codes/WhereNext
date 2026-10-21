"use client";

import type { ReactNode } from "react";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { TripCover } from "@/components/trips/TripCover";
import type { TripSummary } from "@/packages/contracts/trip-summary";
import { daysUntilTrip } from "@/lib/trip-dates";

export type ShellTrip = {
  name: string;
  destination: string;
  dates: string;
  travellers: string;
};

/** The trip as an identity: its cover photograph in a small tile, the name set in display type, where it is, and how
 *  far off it is. Renaming the trip lives on the Overview page's hero, so this is a pure display. */
export function TripIdentity({ trip, tripId, titleAction, photo = true }: { trip: ShellTrip; tripId: string; titleAction?: ReactNode; photo?: boolean }) {
  const live = useTripDataMaybe()?.data?.trip;
  const cover: TripSummary | null = live
    ? { id: tripId, name: live.name, destination: live.destination ?? null, origin: live.origin ?? null, duration_days: live.duration_days ?? null, start_date: live.start_date ?? null, end_date: live.end_date ?? null, travelers: live.travelers ?? null, hero_photo_name: live.hero_photo_name ?? null, saved_photo_name: null }
    : null;
  const until = daysUntilTrip(live?.start_date);
  const status = until == null ? null : until > 1 ? `${until} days to go` : until === 1 ? "Tomorrow" : until === 0 ? "Starts today" : null;
  const sub = [trip.destination, trip.dates].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-3">
      {cover && photo && (
        <TripCover trip={cover} typeLed={false} width={240} className="size-12 shrink-0 rounded-2xl shadow-soft" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="min-w-0 truncate font-display text-lg leading-tight font-medium tracking-[-0.01em]">{trip.name}</h2>
          {titleAction}
        </div>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        {status && (
          <p suppressHydrationWarning className="mt-1 flex items-center gap-1.5 text-2xs font-medium text-coral-ink">
            <span aria-hidden className="size-1.5 rounded-full bg-coral" />
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
