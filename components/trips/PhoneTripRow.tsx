"use client";

import Link from "next/link";
import { TripCover } from "@/components/trips/TripCover";
import { TripLineRow } from "@/components/trips/TripLineRow";
import { TripMenu } from "@/components/trips/TripMenu";
import type { TripSummary } from "@/packages/contracts/trip-summary";
import { shortTripTitle } from "@/components/shell/trip-title";
import { tripWhen } from "@/lib/trip-dates";
import type { TripStatus } from "@/lib/trip-status";
import { cn } from "@/lib/utils";

/**
 * A trip on a phone's home screen: its cover (the destination photo) with how far off it is and, at its foot, the name and the dates. Desktop keeps the photographic cards. The "..." menu is the same one the cards use.
 */
export function PhoneTripRow({ trip, status, deleting, onDelete, compact = false }: { trip: TripSummary; status: TripStatus; deleting: boolean; onDelete: () => void; /** A small row (photo, name, one line) for every trip after the first, so more of them fit on the screen. */ compact?: boolean }) {
  // Under the name: the dates (when there are some) and who is going. A bare length ("5 days") with no dates, or "Dates not set", tells you nothing the badge does not.
  const when = trip.start_date && trip.end_date ? tripWhen(trip.start_date, trip.end_date, trip.duration_days, "") : "";
  const title = shortTripTitle(trip.name);
  const travellers = trip.travelers ? `${trip.travelers} ${trip.travelers === 1 ? "traveller" : "travellers"}` : null;
  if (compact) {
    const days = trip.start_date && trip.end_date ? tripWhen(trip.start_date, trip.end_date, trip.duration_days, "").replace(/ \(\d+ days?\)$/, "") : "";
    return <TripLineRow trip={trip} line={[status.badge, days].filter(Boolean).join(" · ")} deleting={deleting} onDelete={onDelete} />;
  }
  return (
    <div className={cn("relative transition-transform duration-200 active:scale-[0.985]", deleting && "opacity-60")}>
      <Link href={`/trips/${trip.id}`} className="block rounded-4xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {/* The name sits on the photograph, at its foot, over a shade that only that part gets; with no photo it is set in dark type on the plain cover. */}
        <TripCover trip={trip} typeLed={false} className="h-52 rounded-4xl">
          {({ photo }) => (
            <>
              {photo && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-3/5 bg-gradient-to-t from-black/65 via-black/25 to-transparent" />}
              <span suppressHydrationWarning className="photo-chip absolute top-3.5 left-3.5 z-10 gap-1.5">
                {status.phase === "underway" ? <span aria-hidden className="daisy-status daisy-status-success daisy-status-sm" /> : <span aria-hidden className="size-1.5 rounded-full bg-coral" />}
                {status.badge}
              </span>
              <span className={cn("absolute inset-x-0 bottom-0 z-10 block px-5 pb-4", photo ? "text-white" : "text-foreground")}>
                <span className={cn("block truncate font-display text-widget leading-tight font-medium tracking-[-0.025em]", photo && "[text-shadow:0_1px_12px_rgba(0,0,0,0.35)]")}>{title}</span>
                {(when || travellers) && <span className={cn("mt-0.5 block truncate text-body tabular-nums", photo ? "text-white/85" : "text-ink-soft")}>{[when, travellers].filter(Boolean).join(" · ")}</span>}
              </span>
            </>
          )}
        </TripCover>
      </Link>
      <TripMenu name={trip.name} href={`/trips/${trip.id}`} deleting={deleting} onDelete={onDelete} isOwner={trip.is_owner !== false} className="absolute top-2.5 right-2.5 z-20" />
    </div>
  );
}
