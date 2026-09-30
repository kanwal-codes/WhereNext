"use client";

import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Booking } from "@/packages/contracts/booking";

const STATUS: Record<Booking["status"], string> = {
  confirmed: "border-leaf/30 bg-leaf/10 text-foreground",
  pending: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** The booking record for a stay or flight already shown above it: status, reference, price, and a way to its details. */
export function BookingStrip({ booking, onOpen }: { booking: Booking; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left shadow-soft transition-shadow hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className={cn("daisy-badge h-6 shrink-0 px-2.5 text-xs capitalize", STATUS[booking.status])}>{booking.status}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs tracking-wide text-muted-foreground">
        {booking.confirmationCode ? `Ref ${booking.confirmationCode}` : booking.providerReference}
      </span>
      {booking.totalAmount != null && booking.currency && <span className="shrink-0 text-sm tabular-nums">{formatMoney(booking.totalAmount, booking.currency)}</span>}
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Booking details</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
    </button>
  );
}
