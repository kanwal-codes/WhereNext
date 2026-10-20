"use client";

import Link from "next/link";
import { BedDouble, CheckCircle, ChevronLeft, Loader2, Plane, UserPlus, X } from "lucide-react";
import { Sheet, Reveal, ContentSwap } from "@/components/motion-primitives";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatMoney } from "@/lib/currency";
import { formatDuration } from "@/lib/utils";
import { useBookingFlow, type BookingSubject } from "@/features/bookings/application/useBookingFlow";
import type { Booking } from "@/packages/contracts/booking";
import { dateFormat, numberFormat } from "@/lib/format-cache";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const fmtDateTime = (iso: string) => dateFormat([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const flightPrice = (amount: string, currency: string) => {
  try {
    return numberFormat(undefined, { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
};

/**
 * The one booking pop-up — details → review → confirm, for either a flight offer or a
 * hotel room. Built on the app's `Sheet` primitive (right on desktop, bottom on mobile),
 * same as every other detail drawer.
 */
export function BookingSheet({
  subject,
  onClose,
  onBooked,
}: {
  subject: BookingSubject | null;
  onClose: () => void;
  /** Fires once, right after a booking confirms — e.g. so the caller can mark that room/offer as booked. */
  onBooked?: (booking: Booking) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  return (
    <Sheet open={subject !== null} onClose={onClose} side={desktop ? "right" : "bottom"} ariaLabel="Booking">
      {subject && <BookingFlowContent subject={subject} onClose={onClose} onBooked={onBooked} />}
    </Sheet>
  );
}

function BookingFlowContent({ subject, onClose, onBooked }: { subject: BookingSubject; onClose: () => void; onBooked?: (booking: Booking) => void }) {
  const flow = useBookingFlow(subject, onBooked);
  const title = flow.stage === "details" ? (subject.kind === "flight" ? "Traveler details" : "Guest details") : flow.stage === "review" ? "Review your booking" : "Booking confirmed";

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-1.5">
          {flow.stage === "review" && (
            <button type="button" onClick={() => flow.setStage("details")} aria-label="Back" className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="eyebrow">{subject.kind === "flight" ? "Flight" : "Stay"}</p>
            <p className="truncate font-display text-base">{title}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim px-5 py-5">
        <ContentSwap swapKey={flow.stage}>
          {flow.stage === "details" && <DetailsStage subject={subject} flow={flow} />}
          {flow.stage === "review" && <ReviewStage subject={subject} flow={flow} />}
          {flow.stage === "success" && <SuccessStage subject={subject} flow={flow} onClose={onClose} />}
        </ContentSwap>
      </div>
    </>
  );
}

type Flow = ReturnType<typeof useBookingFlow>;

function DetailsStage({ subject, flow }: { subject: BookingSubject; flow: Flow }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="h-px w-7 bg-coral" />
        <h2 className="font-display text-lg">{subject.kind === "flight" ? "Who’s flying" : "Who’s staying"}</h2>
      </div>

      {subject.kind === "flight" ? (
        <div className="space-y-3">
          {flow.passengers.map((p, i) => (
            <div key={p.rowId} className="rounded-2xl border border-border bg-card p-4">
              {flow.passengers.length > 1 && <p className="mb-3 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Traveler {i + 1}</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <select value={p.title} onChange={(e) => flow.updatePassenger(i, { title: e.target.value })} className="input-field col-span-2 sm:col-span-1">
                  <option value="mr">Mr</option>
                  <option value="mrs">Mrs</option>
                  <option value="ms">Ms</option>
                  <option value="miss">Miss</option>
                  <option value="dr">Dr</option>
                </select>
                <input type="date" value={p.bornOn} onChange={(e) => flow.updatePassenger(i, { bornOn: e.target.value })} placeholder="Date of birth" className="input-field col-span-2 sm:col-span-1 [color-scheme:light_dark]" />
                <input value={p.givenName} onChange={(e) => flow.updatePassenger(i, { givenName: e.target.value })} placeholder="Given name" className="input-field" />
                <input value={p.familyName} onChange={(e) => flow.updatePassenger(i, { familyName: e.target.value })} placeholder="Family name" className="input-field" />
                <input type="email" value={p.email} onChange={(e) => flow.updatePassenger(i, { email: e.target.value })} placeholder="Email" className="input-field col-span-2 sm:col-span-1" />
                <input type="tel" value={p.phoneNumber} onChange={(e) => flow.updatePassenger(i, { phoneNumber: e.target.value })} placeholder="Phone (+1...)" className="input-field col-span-2 sm:col-span-1" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {flow.guests.map((g, i) => (
            <div key={g.rowId} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Guest {i + 1}</p>
                {flow.guests.length > 1 && (
                  <button type="button" onClick={() => flow.removeGuest(i)} className="text-xs text-muted-foreground transition-colors hover:text-destructive">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <input value={g.firstName} onChange={(e) => flow.updateGuest(i, { firstName: e.target.value })} placeholder="First name" className="input-field" />
                <input value={g.lastName} onChange={(e) => flow.updateGuest(i, { lastName: e.target.value })} placeholder="Last name" className="input-field" />
                <input type="email" value={g.email} onChange={(e) => flow.updateGuest(i, { email: e.target.value })} placeholder="Email" className="input-field col-span-2" />
              </div>
            </div>
          ))}
          {flow.guests.length < flow.maxGuests && (
            <button type="button" onClick={flow.addGuest} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <UserPlus className="h-3.5 w-3.5" /> Add guest ({flow.guests.length}/{flow.maxGuests})
            </button>
          )}
        </div>
      )}

      <button type="button" disabled={!flow.detailsComplete} onClick={() => flow.setStage("review")} className="btn-primary w-full justify-center disabled:opacity-50">
        Continue to review
      </button>
    </div>
  );
}

function ReviewStage({ subject, flow }: { subject: BookingSubject; flow: Flow }) {
  const price = subject.kind === "flight" ? flightPrice(subject.offer.priceAmount, subject.offer.priceCurrency) : formatMoney(subject.room.totalAmount, subject.room.currency);
  const names = subject.kind === "flight" ? flow.passengers.map((p) => `${p.givenName} ${p.familyName}`.trim()) : flow.guests.map((g) => `${g.firstName} ${g.lastName}`.trim());

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="h-px w-7 bg-coral" />
        <h2 className="font-display text-lg">Confirm the details</h2>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        {subject.kind === "flight" ? (
          <>
            <p className="inline-flex items-center gap-1.5 font-display text-lg">
              <Plane className="h-4 w-4 text-coral" /> {subject.offer.airline}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {subject.offer.originAirport ?? "—"} → {subject.offer.destinationAirport ?? "—"} · {formatDuration(subject.offer.durationMinutes)} · {subject.offer.stops === 0 ? "non-stop" : `${subject.offer.stops} stop${subject.offer.stops === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtDateTime(subject.offer.departAt)} → {fmtDateTime(subject.offer.arriveAt)}
            </p>
            {subject.offer.fareConditions?.length ? (
              <p className="mt-2.5 flex flex-wrap gap-1.5">
                {subject.offer.fareConditions.map((c) => (
                  <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-2xs text-ink-soft">
                    {c}
                  </span>
                ))}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="inline-flex items-center gap-1.5 font-display text-lg">
              <BedDouble className="h-4 w-4 text-coral" /> {subject.hotelName}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {subject.room.name} · {fmtDay(subject.checkin)} → {fmtDay(subject.checkout)} · {subject.nights} night{subject.nights === 1 ? "" : "s"}
            </p>
          </>
        )}
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="font-display text-xl tabular-nums">{price}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="eyebrow">{subject.kind === "flight" ? "Traveler" : "Guests"}{names.length > 1 ? "s" : ""}</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          {names.map((name, i) => (
            <li key={i}>{name || `Guest ${i + 1}`}</li>
          ))}
        </ul>
      </div>

      <button type="button" disabled={flow.submitting} onClick={() => void flow.confirm()} className="btn-primary w-full justify-center disabled:opacity-50">
        {flow.submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Booking…
          </>
        ) : (
          "Confirm & book"
        )}
      </button>
      <p className="text-center text-2xs text-muted-foreground">Sandbox booking — no real payment is taken.</p>
    </div>
  );
}

function SuccessStage({ subject, flow, onClose }: { subject: BookingSubject; flow: Flow; onClose: () => void }) {
  const booking = flow.booking;
  if (!booking) return null;
  const tripId = subject.tripId;
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <Reveal>
        <div className="grid h-16 w-16 place-items-center rounded-full bg-leaf-soft">
          <CheckCircle className="h-8 w-8 text-leaf" />
        </div>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="mt-5 font-display text-2xl">Booking confirmed</h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-1.5 text-sm text-muted-foreground">{subject.kind === "flight" ? subject.offer.airline : subject.hotelName}</p>
      </Reveal>
      <Reveal delay={0.14}>
        <div className="mt-5 w-full rounded-2xl bg-secondary p-5">
          <p className="eyebrow text-leaf">Confirmation code</p>
          <p className="mt-1 font-display text-2xl tracking-wide">{booking.confirmationCode ?? booking.providerReference}</p>
        </div>
      </Reveal>
      <Reveal delay={0.18}>
        <div className="mt-6 flex w-full gap-2">
          <Link href={`/trips/${tripId}/bookings`} className="btn-secondary flex-1 justify-center">
            View in Bookings
          </Link>
          <button type="button" onClick={onClose} className="btn-primary flex-1 justify-center">
            Done
          </button>
        </div>
      </Reveal>
    </div>
  );
}
