"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { ESSENTIALS_TOTAL, EssentialsSurface, essentialsDone } from "@/features/essentials/ui/EssentialsSurface";
import { Reveal, Stagger, StaggerItem, Tactile } from "@/components/motion-primitives";
import { SkeletonLines } from "@/components/Skeleton";
import { BookingDetailSheet } from "@/features/bookings/ui/BookingDetailSheet";
import { GetYourGuideCard } from "@/components/GetYourGuideCard";
import { BookingTicket } from "@/components/overview/BookingTicket";
import { ChapterHero } from "@/components/overview/ChapterHero";
import { SectionHeading } from "@/components/overview/SectionHeading";
import { StayFeature } from "@/components/overview/StayFeature";
import { FlightFeature, readFlightChoice } from "@/components/overview/FlightFeature";
import { fmtDay } from "@/lib/trip-dates";
import { BookingStrip } from "@/components/overview/BookingStrip";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { readStayDecision } from "@/packages/contracts/stay";
import { resolveCurrency } from "@/lib/currency";
import type { Booking } from "@/packages/contracts/booking";
import { ExpensesPanel } from "@/features/expenses/ui/ExpensesPanel";

export default function BookingsPage() {
  const { tripId, data } = useTripData();
  const decisions = (data?.decisions ?? []) as Array<{ kind: string; value: Record<string, unknown> }>;
  const stay = readStayDecision(decisions);
  const destination = data?.trip?.destination ?? "your destination";
  const flight = readFlightChoice(decisions);
  const ticketDetail = (kind: Booking["kind"]): string | undefined =>
    kind === "stay" && stay
      ? `${stay.hotelName} · ${fmtDay(stay.checkin)} to ${fmtDay(stay.checkout)}`
      : kind === "flight" && flight && (flight.from || flight.to)
        ? `${flight.from || "Home"} to ${flight.to || destination}${flight.airline ? ` · ${flight.airline}` : ""}`
        : undefined;

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  useEffect(() => {
    // Instant paint from the last fetch on a quick tab hop (this route remounts on every
    // navigation) — read inside the effect, not the state initializer: sessionStorage isn't
    // available during SSR, so seeding the initializer from it mismatches the server's render
    // and trips a hydration error. The fetch below still always runs to reconcile live.
    const cached = readSessionCache<Booking[]>(`bookings:${tripId}`, 60_000);
    if (cached) setBookings(cached);
    const load = () =>
      fetch(`/api/trips/${tripId}/bookings`)
        .then((r) => r.json())
        .then((body) => {
          const next = body.bookings ?? [];
          writeSessionCache(`bookings:${tripId}`, next);
          setBookings(next);
        })
        .catch(() => setBookings((current) => current ?? []));
    void load();
    // A booking announces "decision" once it settles (useBookingFlow) and a realtime write to
    // the bookings table maps to the same type (trip-realtime.ts) — without this, neither this
    // tab's own just-completed booking nor a collaborator's booked-on-another-device one ever
    // showed up here without a manual reload.
    return subscribeWorkspaceChanges((changes) => {
      if (changes.includes("decision")) void load();
    });
  }, [tripId]);
  const openBooking = bookings?.find((b) => b.id === openBookingId) ?? null;
  // A stay or flight that already has a card above is not listed a second time as a ticket: its
  // booking (status, reference, price) hangs under that card instead.
  const stayBooking = stay ? bookings?.find((b) => b.kind === "stay") ?? null : null;
  const flightBooking = flight ? bookings?.find((b) => b.kind === "flight") ?? null : null;
  const tickets = (bookings ?? []).filter((b) => b !== stayBooking && b !== flightBooking);

  const nights = stay?.nights ?? 0;
  const done = essentialsDone(data?.essentials);
  const bookedCount = (bookings?.filter((b) => b.status === "confirmed").length ?? 0) + (stay ? 1 : 0) + (flight ? 1 : 0);

  return (
    <div className="min-h-full pb-16">
      <ChapterHero
        eyebrow="Bookings & essentials"
        title="Before you go"
        description="What's locked in, and the practical checklist."
        stats={[
          { label: "Booked", value: String(bookedCount), desc: bookedCount === 1 ? "thing locked in" : "things locked in" },
          { label: "Nights", value: String(nights), desc: stay ? `at ${stay.hotelName}` : "no stay yet" },
          { label: "Checklist", value: `${done}/${ESSENTIALS_TOTAL}`, desc: "sorted" },
        ]}
      />

      <div className="mx-auto max-w-6xl space-y-16 px-5 pt-10 sm:px-8">
        <section>
          <SectionHeading title="Your bookings" count={bookedCount} />
          <div className="mt-6 space-y-4">
            <Reveal>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="min-h-0 flex-1">
                    <StayFeature tripId={tripId} stay={stay} compact />
                  </div>
                  {stayBooking && <BookingStrip booking={stayBooking} onOpen={() => setOpenBookingId(stayBooking.id)} />}
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="min-h-0 flex-1">
                    <FlightFeature tripId={tripId} flight={flight} destination={destination} />
                  </div>
                  {flightBooking && <BookingStrip booking={flightBooking} onOpen={() => setOpenBookingId(flightBooking.id)} />}
                </div>
              </div>
            </Reveal>
            {bookings === null ? (
              <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
                <SkeletonLines lines={2} />
              </div>
            ) : tickets.length > 0 ? (
              <Stagger className="grid gap-4 md:grid-cols-2">
                {tickets.map((b) => (
                  <StaggerItem key={b.id} className="h-full">
                    <BookingTicket booking={b} detail={ticketDetail(b.kind)} onOpen={() => setOpenBookingId(b.id)} />
                  </StaggerItem>
                ))}
              </Stagger>
            ) : null}
          </div>
        </section>

        <div className="grid gap-x-10 gap-y-16 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="min-w-0">
            <SectionHeading title="Checklist" />
            <div className="mt-6">
              <EssentialsSurface tripId={tripId} initialCompleted={data?.essentials} />
            </div>
          </section>

          <div className="min-w-0 space-y-4 lg:pt-[3.75rem]">
            <Reveal delay={0.05}>
              <Tactile lift={2} className="block">
                <Link
                  href={`/trips/${tripId}/chat?ask=${encodeURIComponent(`Build me a pre-trip essentials checklist for ${destination} — visas, SIM/eSIM, power plugs, currency, tipping, transit passes, safety, and anything else I should sort before I go.`)}`}
                  className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-gradient-to-br from-card to-coral-soft/50 p-6 shadow-soft"
                >
                  <RoamMark state="settled" size={84} />
                  <span>
                    <span className="block font-display text-2xl tracking-tight">A checklist for {destination}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      Visas, eSIM, plugs, currency, transit passes. Roam builds one for exactly where you&rsquo;re going.
                    </span>
                  </span>
                  <span className="daisy-btn daisy-btn-neutral w-fit border-0 shadow-none">
                    Build it <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </Tactile>
            </Reveal>
            <Reveal delay={0.09}>
              <GetYourGuideCard query={destination} label={`Browse tours and activities in ${destination}`} />
            </Reveal>
          </div>
        </div>

        <section>
          <SectionHeading title="Shared expenses" />
          <div className="mt-6">
            <ExpensesPanel tripId={tripId} defaultCurrency={resolveCurrency(data?.preferences)} />
          </div>
        </section>
      </div>

      <BookingDetailSheet
        tripId={tripId}
        booking={openBooking}
        onClose={() => setOpenBookingId(null)}
        onCancelled={(updated) => setBookings((list) => (list ?? []).map((b) => (b.id === updated.id ? updated : b)))}
      />
    </div>
  );
}
