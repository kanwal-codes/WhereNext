"use client";

import { BedDouble, ChevronRight, Plane } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Booking } from "@/packages/contracts/booking";

const STATUS: Record<Booking["status"], string> = {
  confirmed: "border-leaf/30 bg-leaf/10 text-foreground",
  pending: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** One booking as a ticket: a tinted stub with the kind on the left, a perforated edge, then the details. */
export function BookingTicket({ booking, detail, onOpen }: { booking: Booking; /** What it is for: the hotel and dates, or the route. */ detail?: string; onOpen: () => void }) {
  const live = booking.status === "confirmed" || booking.status === "pending";
  const Icon = booking.kind === "flight" ? Plane : BedDouble;
  return (
    <Tactile lift={2} className="h-full">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group flex h-full w-full overflow-hidden rounded-3xl border bg-card text-left shadow-soft transition-shadow hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          live ? "border-border/70" : "border-border/70 opacity-75",
        )}
      >
        <span className={cn("grid w-20 shrink-0 place-items-center", live ? "bg-leaf/10 text-leaf" : "bg-muted text-muted-foreground")}>
          <Icon className="h-6 w-6" />
        </span>
        <span aria-hidden className="relative w-0 border-l-2 border-dashed border-border">
          <span className="absolute -top-2 -left-[9px] h-4 w-4 rounded-full bg-background" />
          <span className="absolute -bottom-2 -left-[9px] h-4 w-4 rounded-full bg-background" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-3 px-5 py-4">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-display text-xl tracking-tight capitalize">{booking.kind}</span>
              <span className={cn("daisy-badge h-6 px-2.5 text-xs capitalize", STATUS[booking.status])}>{booking.status}</span>
            </span>
            {detail && <span suppressHydrationWarning className="mt-1 block truncate text-sm">{detail}</span>}
            <span className="mt-1 block truncate font-mono text-xs tracking-wide text-muted-foreground">
              {booking.confirmationCode ? `Ref ${booking.confirmationCode}` : booking.providerReference}
            </span>
            {booking.totalAmount != null && booking.currency && (
              <span className="mt-1 block text-sm tabular-nums">{formatMoney(booking.totalAmount, booking.currency)}</span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </button>
    </Tactile>
  );
}
