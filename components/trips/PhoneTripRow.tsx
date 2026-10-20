"use client";

import Link from "next/link";
import { DateStamp } from "@/components/shell/DateStamp";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/components/trips/types";
import { shortTripTitle } from "@/components/shell/trip-title";
import { tripWhen } from "@/lib/trip-dates";
import type { TripStatus } from "@/lib/trip-status";
import { cn } from "@/lib/utils";

/**
 * A trip on a phone's home screen (phone redesign): the dashed date stamp, the name, where and when, and how far off it
 * is, in one calm row. Desktop keeps the photographic cards. The "..." menu is the same one the cards use.
 */
export function PhoneTripRow({ trip, status, deleting, onDelete }: { trip: TripSummary; status: TripStatus; deleting: boolean; onDelete: () => void }) {
  const when = tripWhen(trip.start_date, trip.end_date, trip.duration_days, "Dates not set");
  const title = shortTripTitle(trip.name);
  // A trip named after its route already says where it goes; anything else gets its destination as a second line.
  const where = title === trip.name && trip.destination && trip.destination !== trip.name ? trip.destination : null;
  return (
    <div className={cn("relative flex items-center gap-3.5 rounded-[1.375rem] border border-border bg-card p-3 pr-2 shadow-soft transition-transform duration-200 active:scale-[0.99]", deleting && "opacity-60")}>
      <Link href={`/trips/${trip.id}`} className="flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`${trip.name}. ${status.badge}`}>
        <DateStamp start={trip.start_date} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-display text-[1.0625rem] leading-snug font-medium tracking-[-0.015em]">{title}</span>
          {where && <span className="mt-0.5 block truncate text-sm text-ink-soft">{where}</span>}
          <span className="mt-0.5 flex items-baseline gap-1.5 text-sm tabular-nums">
            <span className="min-w-0 truncate text-muted-foreground">{when}</span>
            <span aria-hidden className="text-muted-foreground">·</span>
            <span suppressHydrationWarning className={cn("shrink-0 font-semibold", status.phase === "past" ? "text-muted-foreground" : "text-coral-ink")}>{status.badge}</span>
          </span>
        </span>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} isOwner={trip.is_owner !== false} />
    </div>
  );
}
