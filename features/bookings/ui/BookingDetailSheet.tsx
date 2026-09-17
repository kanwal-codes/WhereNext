"use client";

import { useState } from "react";
import { BedDouble, Plane, X, XCircle } from "lucide-react";
import { Sheet, Reveal } from "@/components/motion-primitives";
import { useMediaQuery } from "@/lib/use-media-query";
import { notifyToast } from "@/lib/application/toast";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Booking } from "@/packages/contracts/booking";

const STATUS_STYLE: Record<Booking["status"], string> = {
  confirmed: "bg-leaf-soft text-leaf",
  pending: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
};

/** Read+cancel view for a booking already on the trip — the Bookings page's detail pop-up. */
export function BookingDetailSheet({
  tripId,
  booking,
  onClose,
  onCancelled,
}: {
  tripId: string;
  booking: Booking | null;
  onClose: () => void;
  onCancelled: (booking: Booking) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function cancel() {
    if (!booking) return;
    setCancelling(true);
    try {
      const r = await fetch(`/api/trips/${tripId}/bookings/${booking.id}/cancel`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Cancellation failed");
      onCancelled(body.booking as Booking);
      notifyToast("Booking cancelled.", "success");
      setConfirmingCancel(false);
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "That didn’t cancel. Try again.", "error");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Sheet open={booking !== null} onClose={onClose} side={desktop ? "right" : "bottom"} ariaLabel="Booking details">
      {booking && (
        <>
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="eyebrow capitalize">{booking.kind}</p>
              <p className="truncate font-display text-base">Booking details</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim px-5 py-5">
            <div className="flex flex-col items-center py-4 text-center">
              <Reveal>
                <div className={cn("grid h-14 w-14 place-items-center rounded-full", booking.status === "cancelled" || booking.status === "failed" ? "bg-destructive/10" : "bg-leaf-soft")}>
                  {booking.kind === "flight" ? (
                    <Plane className={cn("h-6 w-6", booking.status === "cancelled" || booking.status === "failed" ? "text-destructive" : "text-leaf")} />
                  ) : (
                    <BedDouble className={cn("h-6 w-6", booking.status === "cancelled" || booking.status === "failed" ? "text-destructive" : "text-leaf")} />
                  )}
                </div>
              </Reveal>
              <Reveal delay={0.06}>
                <span className={cn("mt-4 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium capitalize", STATUS_STYLE[booking.status])}>{booking.status}</span>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="mt-5 w-full rounded-2xl border border-dashed border-border bg-card/60 p-5">
                  <p className="eyebrow">Confirmation code</p>
                  <p className="mt-1 font-display text-2xl tracking-wide">{booking.confirmationCode ?? booking.providerReference ?? "—"}</p>
                </div>
              </Reveal>
              {booking.totalAmount != null && booking.currency && (
                <Reveal delay={0.14}>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Total <span className="font-medium text-foreground tabular-nums">{formatMoney(booking.totalAmount, booking.currency)}</span>
                  </p>
                </Reveal>
              )}
              <Reveal delay={0.18}>
                <p className="mt-1 text-xs text-muted-foreground">Booked {new Date(booking.createdAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</p>
              </Reveal>

              {(booking.status === "confirmed" || booking.status === "pending") && (
                <div className="mt-6 w-full">
                  {confirmingCancel ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-left">
                      <p className="text-sm font-medium text-destructive">Cancel this booking?</p>
                      <p className="mt-1 text-xs text-muted-foreground">This can’t be undone in the sandbox.</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" disabled={cancelling} onClick={() => void cancel()} className="btn-destructive flex-1">
                          {cancelling ? "Cancelling…" : "Yes, cancel"}
                        </button>
                        <button type="button" onClick={() => setConfirmingCancel(false)} className="btn-secondary flex-1 justify-center">
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmingCancel(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive transition-opacity hover:opacity-75">
                      <XCircle className="h-4 w-4" /> Cancel booking
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
