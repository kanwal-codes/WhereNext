"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BedDouble, CalendarCheck, Plane, Sparkles } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { EssentialsSurface } from "@/features/essentials/ui/EssentialsSurface";
import { Reveal, Stagger, StaggerItem, Tactile } from "@/components/motion-primitives";
import { SkeletonLines } from "@/components/Skeleton";
import { BookingDetailSheet } from "@/features/bookings/ui/BookingDetailSheet";
import { readStayDecision } from "@/packages/contracts/stay";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Booking } from "@/packages/contracts/booking";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const STATUS_BADGE: Record<Booking["status"], string> = {
  confirmed: "bg-leaf-soft text-leaf",
  pending: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function BookingsPage() {
  const { tripId, data } = useTripData();
  const decisions = (data?.decisions ?? []) as Array<{ kind: string; value: Record<string, unknown> }>;
  const stay = readStayDecision(decisions);
  const destination = data?.trip?.destination ?? "your destination";

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/trips/${tripId}/bookings`)
      .then((r) => r.json())
      .then((body) => setBookings(body.bookings ?? []))
      .catch(() => setBookings([]));
  }, [tripId]);
  const openBooking = bookings?.find((b) => b.id === openBookingId) ?? null;

  return (
    <RouteScaffold
      eyebrow="Bookings & essentials"
      title="Before you go"
      description="What's locked in, and the practical checklist. For destination-specific essentials — visas, SIMs, customs — ask Roam to build one."
    >
      <div className="space-y-8">
        <section>
          <h2 className="font-display text-lg">Your bookings</h2>
          {bookings === null ? (
            <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <SkeletonLines lines={2} />
            </div>
          ) : bookings.length > 0 ? (
            <Stagger className="mt-3 space-y-2">
              {bookings.map((b) => (
                <StaggerItem key={b.id}>
                  <Tactile lift={2}>
                    <button
                      type="button"
                      onClick={() => setOpenBookingId(b.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-lift",
                        b.status === "cancelled" || b.status === "failed" ? "border-border" : "border-leaf/30",
                      )}
                    >
                      {b.kind === "flight" ? <Plane className="h-4 w-4 shrink-0 text-leaf" /> : <BedDouble className="h-4 w-4 shrink-0 text-leaf" />}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium capitalize">
                          {b.kind}
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_BADGE[b.status])}>{b.status}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {b.confirmationCode ? `Confirmation ${b.confirmationCode}` : b.providerReference}
                          {b.totalAmount != null && b.currency ? ` · ${formatMoney(b.totalAmount, b.currency)}` : ""}
                        </p>
                      </div>
                    </button>
                  </Tactile>
                </StaggerItem>
              ))}
            </Stagger>
          ) : null}
          {stay ? (
            <Reveal delay={0.04}>
              <Tactile lift={2} className="mt-3 block">
                <Link
                  href={`/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}?checkin=${stay.checkin}&checkout=${stay.checkout}`}
                  className="flex items-center gap-4 overflow-hidden rounded-2xl border border-leaf/30 bg-card p-4 shadow-soft"
                >
                  {stay.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- external hotel image
                    <img src={stay.thumbnail} alt={stay.hotelName} width={96} height={96} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="eyebrow inline-flex items-center gap-1.5 text-leaf"><BedDouble className="h-3.5 w-3.5" /> Stay</p>
                    <p className="mt-0.5 truncate font-medium">{stay.hotelName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDay(stay.checkin)} → {fmtDay(stay.checkout)} · {stay.nights} night{stay.nights === 1 ? "" : "s"} ·{" "}
                      <span className="tabular-nums text-foreground">{stay.totalAmount} {stay.currency}</span>
                    </p>
                  </div>
                </Link>
              </Tactile>
            </Reveal>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5">
              <p className="text-sm font-medium">{bookings && bookings.length > 0 ? "No stay locked in yet" : "Nothing booked yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Lock a place to stay from the Stay tab, or ask Roam to compare options.
              </p>
              <Link href={`/trips/${tripId}/stay`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Find a stay <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg">
              <CalendarCheck className="h-4 w-4 text-coral" /> Checklist
            </h2>
          </div>
          <div className="mt-3">
            <EssentialsSurface tripId={tripId} initialCompleted={data?.essentials} />
          </div>
        </section>

        <Reveal delay={0.08}>
          <Tactile lift={2} className="block">
            <Link
              href={`/trips/${tripId}/chat?ask=${encodeURIComponent(`Build me a pre-trip essentials checklist for ${destination} — visas, SIM/eSIM, power plugs, currency, tipping, transit passes, safety, and anything else I should sort before I go.`)}`}
              className="flex items-start gap-3 rounded-2xl border border-coral/25 bg-gradient-to-br from-card to-coral-soft/40 p-5 shadow-soft"
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
              <span>
                <span className="font-medium">Get a checklist for {destination}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Visas, eSIM, plugs, currency, transit passes — Roam builds one for exactly where you&rsquo;re going.
                </span>
              </span>
            </Link>
          </Tactile>
        </Reveal>
      </div>

      <BookingDetailSheet
        tripId={tripId}
        booking={openBooking}
        onClose={() => setOpenBookingId(null)}
        onCancelled={(updated) => setBookings((list) => (list ?? []).map((b) => (b.id === updated.id ? updated : b)))}
      />
    </RouteScaffold>
  );
}
