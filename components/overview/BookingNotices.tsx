"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { lodgingGaps, outsideTripDates } from "@/lib/trip-reservations";
import type { Reservation } from "@/packages/contracts/reservation";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * What does not add up between the bookings and the trip: nights with no stay booked, and bookings dated outside
 * the trip's dates (after the dates moved, say). Nothing renders when everything fits, or when the trip has no dates yet.
 */
export function BookingNotices({ tripId, reservations, startDate, endDate }: { tripId: string; reservations: Reservation[]; startDate: string | null | undefined; endDate: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (reservations.length === 0) return null;
  const gaps = lodgingGaps(reservations, startDate, endDate);
  const stray = outsideTripDates(reservations, startDate, endDate);
  if (gaps.length === 0 && stray.length === 0) return null;
  const nights = gaps.reduce((t, g) => t + g.nights, 0);
  const list = (
    <div className="divide-y divide-hairline border-y border-hairline" role="status">
      {gaps.length > 0 && (
        <div className="flex min-h-11 items-center gap-2.5 py-2 text-sm text-ink-soft">
          <AlertTriangle className="size-4 shrink-0 text-caution" aria-hidden />
          <span className="min-w-0 flex-1">
            No stay for {nights} {nights === 1 ? "night" : "nights"}
          </span>
          <Link href={`/trips/${tripId}/stay`} className="shrink-0 py-2 font-medium text-foreground underline underline-offset-4">Find a stay</Link>
        </div>
      )}
      {stray.length > 0 && (
        <details className="group py-1 text-sm text-ink-soft">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="size-4 shrink-0 text-caution" aria-hidden />
            <span className="min-w-0 flex-1">{stray.length === 1 ? "1 booking falls" : `${stray.length} bookings fall`} outside the trip dates</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="pb-3 pl-[1.625rem]" suppressHydrationWarning>
            {stray.slice(0, 3).map((r) => `${r.title} (${r.startsOn && day(r.startsOn)})`).join(", ")}
            {stray.length > 3 ? ` and ${stray.length - 3} more` : ""}. Bookings keep their own dates: change the trip dates ({startDate && day(startDate)} to {endDate && day(endDate)}) or edit the booking.
          </p>
        </details>
      )}
    </div>
  );
  // Phone redesign: the two notices are one quiet row; the detail and "Find a stay" are in the sheet.
  const count = (gaps.length > 0 ? 1 : 0) + (stray.length > 0 ? 1 : 0);
  return (
    <>
      <div className="max-lg:hidden">{list}</div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="flex min-h-12 w-full items-center gap-2.5 rounded-2xl bg-muted px-4 text-left text-[0.9375rem] transition-transform active:scale-[0.985] lg:hidden">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-coral" />
        <span className="min-w-0 flex-1 truncate" suppressHydrationWarning>
          <b className="font-semibold">{count === 1 ? "1 thing to check" : `${count} things to check`}</b>
          <span className="text-ink-soft"> · {gaps.length > 0 ? `no stay for ${nights} ${nights === 1 ? "night" : "nights"}` : `${stray.length} ${stray.length === 1 ? "booking" : "bookings"} outside the dates`}</span>
        </span>
        <ChevronRight className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="bottom" ariaLabel="Things to check" className="rounded-t-4xl bg-background px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="pb-2 font-display text-xl font-medium tracking-[-0.02em]">Things to check</p>
        {list}
      </Sheet>
    </>
  );
}
