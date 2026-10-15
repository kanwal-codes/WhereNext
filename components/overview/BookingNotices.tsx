"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { lodgingGaps, outsideTripDates } from "@/lib/trip-reservations";
import type { Reservation } from "@/packages/contracts/reservation";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * What does not add up between the bookings and the trip: nights with no stay booked, and bookings dated outside
 * the trip's dates (after the dates moved, say). Nothing renders when everything fits, or when the trip has no dates yet.
 */
export function BookingNotices({ tripId, reservations, startDate, endDate }: { tripId: string; reservations: Reservation[]; startDate: string | null | undefined; endDate: string | null | undefined }) {
  if (reservations.length === 0) return null;
  const gaps = lodgingGaps(reservations, startDate, endDate);
  const stray = outsideTripDates(reservations, startDate, endDate);
  if (gaps.length === 0 && stray.length === 0) return null;
  const nights = gaps.reduce((t, g) => t + g.nights, 0);
  return (
    <div className="space-y-2" role="status">
      {gaps.length > 0 && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-caution/30 bg-caution-soft/40 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden />
          <span suppressHydrationWarning>
            No stay booked for {nights} {nights === 1 ? "night" : "nights"}: {gaps.map((g) => `${day(g.from)} to ${day(g.to)}`).join(", ")}.{" "}
            <Link href={`/trips/${tripId}/stay`} className="font-medium underline underline-offset-2">Find a stay</Link>
          </span>
        </p>
      )}
      {stray.length > 0 && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-caution/30 bg-caution-soft/40 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden />
          <span suppressHydrationWarning>
            {stray.length === 1 ? "A booking falls" : `${stray.length} bookings fall`} outside the trip dates ({startDate && day(startDate)} to {endDate && day(endDate)}): {stray.slice(0, 3).map((r) => `${r.title} (${r.startsOn && day(r.startsOn)})`).join(", ")}
            {stray.length > 3 ? ` and ${stray.length - 3} more` : ""}. Bookings keep their own dates: change the trip dates or edit the booking.
          </span>
        </p>
      )}
    </div>
  );
}
