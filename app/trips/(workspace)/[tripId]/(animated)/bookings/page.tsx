"use client";

import { BookingNotices } from "@/components/overview/BookingNotices";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, UtensilsCrossed } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { cachedGet } from "@/lib/client/cached-get";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { ESSENTIALS_TOTAL, EssentialsSurface, essentialsDone } from "@/features/essentials/ui/EssentialsSurface";
import { Reveal, Stagger, StaggerItem, Tactile } from "@/components/motion-primitives";
import { BookingDetailSheet } from "@/features/bookings/ui/BookingDetailSheet";
import { GetYourGuideCard } from "@/components/GetYourGuideCard";
import { ChapterHero } from "@/components/overview/ChapterHero";
import { SectionHeading } from "@/components/overview/SectionHeading";
import { TableSheet } from "@/components/overview/TableSheet";
import { ReservationSheet } from "@/components/overview/ReservationSheet";
import { ReservationsTimeline } from "@/components/overview/ReservationsTimeline";
import { NextUpCard } from "@/components/overview/NextUpCard";
import { buildTimeline, pickNextUp, readFlightChoice } from "@/lib/trip-reservations";
import type { Reservation } from "@/packages/contracts/reservation";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { readStayDecision } from "@/packages/contracts/stay";
import { resolveCurrency } from "@/lib/currency";
import type { Booking } from "@/packages/contracts/booking";
import { useRemoveTripItem } from "@/features/bookings/application/useRemoveTripItem";
import type { TimelineItem } from "@/lib/trip-reservations";
import { ExpensesPanel } from "@/features/expenses/ui/ExpensesPanel";
import { Sheet } from "@/components/motion-primitives";
import { PHONE_V2 } from "@/lib/phone-v2";
import { cn } from "@/lib/utils";

/** Saved places that are somewhere to eat, by Google's place type ("restaurant", "cafe", "brunch_restaurant"...). */
const FOOD_PLACE = /restaurant|cafe|coffee|bakery|bar$|^bar|food|pizza|bistro|diner|meal|steak|sushi|ramen|brunch/i;

export default function BookingsPage() {
  const { tripId, data } = useTripData();
  const decisions = (data?.decisions ?? []) as Array<{ kind: string; value: Record<string, unknown> }>;
  const stay = readStayDecision(decisions);
  const destination = data?.trip?.destination ?? "your destination";
  const flight = readFlightChoice(decisions);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  useEffect(() => {
    // Until the reservations table exists (or if the request fails) the page still shows
    // bookings, the stay and the flight: an empty list, not an error.
    const load = () =>
      cachedGet(`/api/trips/${tripId}/reservations`, { ttlMs: 0 })
        .then((r) => (r.ok ? r.json() : { reservations: [] }))
        .then((body) => setReservations(body.reservations ?? []))
        .catch(() => setReservations((current) => current ?? []));
    void load();
    return subscribeWorkspaceChanges((changes) => {
      if (changes.includes("decision")) void load();
    });
  }, [tripId]);
  useEffect(() => {
    // Instant paint from the last fetch on a quick tab hop (this route remounts on every
    // navigation) — read inside the effect, not the state initializer: sessionStorage isn't
    // available during SSR, so seeding the initializer from it mismatches the server's render
    // and trips a hydration error. The fetch below still always runs to reconcile live.
    const cached = readSessionCache<Booking[]>(`bookings:${tripId}`, 60_000);
    if (cached) setBookings(cached);
    const load = () =>
      cachedGet(`/api/trips/${tripId}/bookings`, { ttlMs: 0 })
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
  const savedRestaurants = ((data?.savedPlaces ?? []) as Array<{ places?: { provider_id?: string; name: string; category?: string | null; address?: string | null } }>)
    .flatMap((row) => (row.places?.provider_id && FOOD_PLACE.test(row.places.category ?? "") ? [{ providerId: row.places.provider_id, name: row.places.name, address: row.places.address ?? null, mapsUrl: null }] : []));
  const timeline = buildTimeline({ reservations: reservations ?? [], bookings: bookings ?? [], stay, flight, tripId });
  const nextUp = pickNextUp(timeline);
  const rest = nextUp ? timeline.filter((i) => i !== nextUp) : timeline;
  const editItem = (item: { reservation: Reservation | null }) => {
    setEditing(item.reservation);
    setSheetOpen(true);
  };
  const { removeDecision, removeReservation } = useRemoveTripItem(tripId);
  const removeItem = async (item: TimelineItem): Promise<boolean> => {
    const { removal, reservation } = item;
    if (removal?.type === "reservation" && reservation) return removeReservation(reservation, (id) => setReservations((list) => (list ?? []).filter((r) => r.id !== id)));
    if (removal?.type === "decision") return removeDecision(removal.kind, item.title);
    return false;
  };
  // Confirmed: a provider order that went through, or a hand-entered booking that has its own booking reference.
  const confirmed = timeline.filter((i) => i.status === "confirmed" || (i.reservation && i.reservation.status !== "cancelled" && Boolean(i.code))).length;
  const done = essentialsDone(data?.essentials);
  const loading = bookings === null || reservations === null;

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  return (
    <div className="min-h-full pb-16">
      <ChapterHero
        eyebrow="Bookings & essentials"
        title="Before you go"
        description="Every stay, ticket and reservation in one place, and the practical checklist."
        phoneTitle="Bookings"
        phoneLine={`${timeline.length} reserved · ${confirmed} confirmed`}
        stats={[
          { label: "Reserved", value: String(timeline.length), desc: timeline.length === 1 ? "thing on the trip" : "things on the trip" },
          { label: "Confirmed", value: String(confirmed), desc: "with a booking reference" },
          { label: "Checklist", value: `${done}/${ESSENTIALS_TOTAL}`, desc: "sorted" },
        ]}
      />

      <div className="mx-auto max-w-6xl space-y-12 px-5 pt-6 sm:space-y-16 sm:px-8 sm:pt-8">
        <section>
          <div className={cn(PHONE_V2 && "max-lg:hidden")}><SectionHeading title="Your bookings" count={timeline.length} /></div>
          {!loading && (
            <div className="mt-6 empty:hidden max-lg:mt-3">
              <BookingNotices tripId={tripId} reservations={reservations ?? []} startDate={data?.trip?.start_date} endDate={data?.trip?.end_date} />
            </div>
          )}
          <div className="mt-6 max-lg:mt-4">
            {loading ? (
              // Shaped like what is coming (the next booking, then rows), so the page does not jump when the bookings arrive.
              <div aria-hidden className="space-y-8">
                <div className="skeleton h-[12.25rem] rounded-[1.75rem] lg:h-[26rem] lg:rounded-3xl" />
                <div className="space-y-5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3.5">
                      <div className="skeleton size-12 shrink-0 rounded-2xl" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-4 w-2/3 rounded-md" />
                        <div className="skeleton h-3 w-1/3 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : timeline.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
                <p className="font-display text-2xl tracking-tight">Nothing reserved yet</p>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  Add a hotel, a train, a tour or a dinner as you book it, or find a stay and a flight here and they will appear on their own.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={openAdd} className="btn-primary h-11 rounded-full px-6">
                    <Plus className="h-4 w-4" /> Add reservation
                  </button>
                  <button type="button" onClick={() => setTableOpen(true)} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent">
                    <UtensilsCrossed className="h-4 w-4" /> Reserve a table
                  </button>
                  <Link href={`/trips/${tripId}/stay`} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent">
                    Find a stay
                  </Link>
                  <Link href={`/trips/${tripId}/map`} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent">
                    Find a flight
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-10">
                {nextUp && <NextUpCard item={nextUp} onOpenBooking={setOpenBookingId} onEdit={editItem} onRemove={removeItem} />}
                <ReservationsTimeline items={rest} hasNextUp={Boolean(nextUp)} onAdd={openAdd} onReserveTable={() => setTableOpen(true)} onOpenBooking={setOpenBookingId} onEdit={editItem} onRemove={removeItem} />
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-x-10 gap-y-16 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {PHONE_V2 && (
            <button type="button" onClick={() => setChecklistOpen(true)} aria-haspopup="dialog" className="-mt-4 flex min-h-[4.25rem] w-full items-center gap-3.5 border-t border-hairline py-2 text-left lg:hidden">
              <svg viewBox="0 0 48 48" className="size-12 shrink-0" aria-hidden>
                <circle cx="24" cy="24" r="19" fill="none" className="stroke-hairline" strokeWidth="5" />
                <circle cx="24" cy="24" r="19" fill="none" className="stroke-coral" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(119.4 * done) / ESSENTIALS_TOTAL} 119.4`} transform="rotate(-90 24 24)" />
              </svg>
              <span className="min-w-0 flex-1">
                <b className="block font-display text-base font-medium leading-tight">Before you go</b>
                <span className="text-sm text-ink-soft tabular-nums">{done} of {ESSENTIALS_TOTAL} checked off</span>
              </span>
              <ArrowRight className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
            </button>
          )}
          <section className={cn("min-w-0", PHONE_V2 && "max-lg:hidden")}>
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
                  className="card-lift flex flex-col gap-4 rounded-3xl border border-border/70 bg-gradient-to-br from-card to-coral-soft/50 p-6 shadow-soft"
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

      {PHONE_V2 && (
        <Sheet open={checklistOpen} onClose={() => setChecklistOpen(false)} side="bottom" ariaLabel="Before you go checklist" className="rounded-t-[1.75rem] bg-background px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="pb-3 font-display text-xl font-medium tracking-[-0.02em]">Before you go</p>
          <div className="min-h-0 flex-1 overflow-y-auto"><EssentialsSurface tripId={tripId} initialCompleted={data?.essentials} /></div>
        </Sheet>
      )}

      <TableSheet
        tripId={tripId}
        open={tableOpen}
        destination={data?.trip?.destination ?? ""}
        defaultDate={data?.trip?.start_date ?? ""}
        defaultParty={data?.trip?.travelers ?? 2}
        saved={savedRestaurants}
        onClose={() => setTableOpen(false)}
        onSaved={(saved) => setReservations((list) => [...(list ?? []).filter((r) => r.id !== saved.id), saved])}
      />

      <ReservationSheet
        tripId={tripId}
        open={sheetOpen}
        editing={editing}
        defaultCurrency={resolveCurrency(data?.preferences)}
        defaultDate={data?.trip?.start_date ?? ""}
        onClose={() => setSheetOpen(false)}
        onSaved={(saved) => setReservations((list) => [...(list ?? []).filter((r) => r.id !== saved.id), saved])}
        onDeleted={(id) => setReservations((list) => (list ?? []).filter((r) => r.id !== id))}
      />

      <BookingDetailSheet
        tripId={tripId}
        booking={openBooking}
        onClose={() => setOpenBookingId(null)}
        onCancelled={(updated) => setBookings((list) => (list ?? []).map((b) => (b.id === updated.id ? updated : b)))}
      />
    </div>
  );
}
