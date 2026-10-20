"use client";

import { BedDouble } from "lucide-react";
import { HotelPhoto } from "@/components/HotelPhoto";
import { fmtDay } from "@/lib/trip-dates";
import type { StayDecision } from "@/packages/contracts/stay";

/** "Based at": the hotel chosen for the trip, above the days. */
export function BasedAtCard({ lockedStay }: { lockedStay: StayDecision }) {
  return (
    <div className="flex items-center gap-4 overflow-hidden rounded-3xl border border-border/70 bg-card p-3 pr-5 shadow-soft">
      <HotelPhoto
        src={lockedStay.thumbnail}
        width={96}
        height={96}
        className="h-16 w-16 shrink-0 rounded-2xl object-cover"
        fallback={
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-muted">
            <BedDouble className="h-5 w-5 text-muted-foreground" />
          </span>
        }
      />
      <div className="min-w-0">
        <p className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Based at</p>
        <p className="truncate font-display text-xl tracking-tight">{lockedStay.hotelName}</p>
        <p suppressHydrationWarning className="truncate text-sm text-muted-foreground">
          {fmtDay(lockedStay.checkin)} to {fmtDay(lockedStay.checkout)}
        </p>
      </div>
    </div>
  );
}
