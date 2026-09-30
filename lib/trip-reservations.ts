import { formatMoney } from "@/lib/currency";
import type { Booking } from "@/packages/contracts/booking";
import type { Reservation, ReservationKind } from "@/packages/contracts/reservation";
import type { StayDecision } from "@/packages/contracts/stay";

/**
 * The Bookings page's single list. Three sources say "something is reserved": provider orders
 * (`bookings`), the stay and flight the trip has chosen (`decisions`), and reservations entered
 * by hand. A stay or flight that appears in more than one of them is one row, not two.
 */

export type Category = "stay" | "travel" | "do";
export const CATEGORY_LABEL: Record<Category, string> = { stay: "Stays", travel: "Travel", do: "Things to do" };

export type TimelineItem = {
  id: string;
  kind: ReservationKind;
  category: Category;
  title: string;
  subtitle: string | null;
  /** First day, YYYY-MM-DD; null when nothing says when. */
  date: string | null;
  endDate: string | null;
  time: string | null;
  place: string | null;
  code: string | null;
  amountLabel: string | null;
  status: Booking["status"] | null;
  thumbnail: string | null;
  /** Set when a provider order backs this row, so its details can be opened. */
  bookingId: string | null;
  /** Set when the row was entered by hand, so it can be edited. */
  reservation: Reservation | null;
  /** Where the row leads, when it leads somewhere. */
  href: string | null;
};

export type FlightChoice = { from: string; to: string; airline: string; fare: string; stops: number | null; minutes: number | null; departAt: string | null; arriveAt: string | null };

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The latest flight saved from Getting around (decisions come newest first), or null. */
export function readFlightChoice(decisions: ReadonlyArray<{ kind: string; value: unknown }>): FlightChoice | null {
  for (const decision of decisions) {
    if (decision.kind !== "transport") continue;
    const v = (decision.value ?? {}) as Record<string, unknown>;
    if (v.mode !== "flight") continue;
    return {
      from: text(v.from),
      to: text(v.to),
      airline: text(v.airline),
      fare: text(v.fare),
      stops: num(v.stops),
      minutes: num(v.minutes),
      departAt: text(v.departAt) || null,
      arriveAt: text(v.arriveAt) || null,
    };
  }
  return null;
}

export const categoryOf = (kind: ReservationKind): Category => (kind === "stay" ? "stay" : kind === "flight" || kind === "train" ? "travel" : "do");

const isoDay = (iso: string | null): string | null => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);
const isoTime = (iso: string | null): string | null => (iso && /T\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : null);
const code = (label: string): string => /\(([A-Za-z]{3})\)\s*$/.exec(label)?.[1]?.toUpperCase() ?? label;

/** "2026-10-12" as "Mon, Oct 12", parsed as a local date so no timezone shifts the day. */
export function dayHeading(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** "19:30" as the viewer's clock ("7:30 PM"). */
export function clockLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const money = (amount: number | null, currency: string | null): string | null => (amount != null && currency ? formatMoney(amount, currency) : null);

export function buildTimeline(input: {
  reservations: Reservation[];
  bookings: Booking[];
  stay: StayDecision | null;
  flight: FlightChoice | null;
  tripId: string;
}): TimelineItem[] {
  const { reservations, bookings, stay, flight, tripId } = input;
  const items: TimelineItem[] = [];
  const used = new Set<string>();
  const take = (kind: Booking["kind"]): Booking | null => {
    const hit = bookings.find((b) => b.kind === kind && !used.has(b.id));
    if (hit) used.add(hit.id);
    return hit ?? null;
  };

  if (stay) {
    const booking = take("stay");
    items.push({
      id: `stay:${stay.hotelId}`,
      kind: "stay",
      category: "stay",
      title: stay.hotelName,
      subtitle: [stay.roomName, stay.board].filter(Boolean).join(" · ") || null,
      date: isoDay(stay.checkin),
      endDate: isoDay(stay.checkout),
      time: null,
      place: stay.address,
      code: booking?.confirmationCode ?? booking?.providerReference ?? null,
      amountLabel: money(stay.totalAmount, stay.currency),
      status: booking?.status ?? null,
      thumbnail: stay.thumbnail,
      bookingId: booking?.id ?? null,
      reservation: null,
      href: `/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}?checkin=${stay.checkin}&checkout=${stay.checkout}`,
    });
  }

  if (flight) {
    const booking = take("flight");
    items.push({
      id: "flight:choice",
      kind: "flight",
      category: "travel",
      title: `${code(flight.from || "Home")} to ${code(flight.to || "there")}`,
      subtitle: [flight.airline, flight.stops === null ? null : flight.stops === 0 ? "Non-stop" : `${flight.stops} ${flight.stops === 1 ? "stop" : "stops"}`].filter(Boolean).join(" · ") || null,
      date: isoDay(flight.departAt),
      endDate: null,
      time: isoTime(flight.departAt),
      place: null,
      code: booking?.confirmationCode ?? booking?.providerReference ?? null,
      amountLabel: flight.fare || null,
      status: booking?.status ?? null,
      thumbnail: null,
      bookingId: booking?.id ?? null,
      reservation: null,
      href: null,
    });
  }

  for (const booking of bookings) {
    if (used.has(booking.id)) continue;
    items.push({
      id: `booking:${booking.id}`,
      kind: booking.kind,
      category: categoryOf(booking.kind),
      title: booking.kind === "flight" ? "Flight booking" : "Stay booking",
      subtitle: null,
      // When it was booked says nothing about when the trip uses it, so it waits under "Date to be added".
      date: null,
      endDate: null,
      time: null,
      place: null,
      code: booking.confirmationCode ?? booking.providerReference,
      amountLabel: money(booking.totalAmount, booking.currency),
      status: booking.status,
      thumbnail: null,
      bookingId: booking.id,
      reservation: null,
      href: null,
    });
  }

  for (const r of reservations) {
    items.push({
      id: `reservation:${r.id}`,
      kind: r.kind,
      category: categoryOf(r.kind),
      title: r.title,
      subtitle: r.notes,
      date: r.startsOn,
      endDate: r.endsOn,
      time: r.startTime,
      place: r.place,
      code: r.confirmationCode,
      amountLabel: money(r.amount, r.currency),
      status: null,
      thumbnail: null,
      bookingId: null,
      reservation: r,
      href: null,
    });
  }

  // Dated rows first, earliest first, then by time of day; undated rows last in the order they came.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.date !== b.item.date) return a.item.date === null ? 1 : b.item.date === null ? -1 : a.item.date < b.item.date ? -1 : 1;
      if (a.item.time !== b.item.time) return a.item.time === null ? -1 : b.item.time === null ? 1 : a.item.time < b.item.time ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export type TimelineGroup = { date: string | null; label: string; items: TimelineItem[] };

/** Consecutive rows that share a start date, headed by that date; undated rows get "Date to be added". */
export function groupByDate(items: TimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, label: item.date ? dayHeading(item.date) : "Date to be added", items: [item] });
  }
  return groups;
}

export function filterByCategory(items: TimelineItem[], category: Category | "all"): TimelineItem[] {
  return category === "all" ? items : items.filter((i) => i.category === category);
}

export function countByCategory(items: TimelineItem[]): Record<Category | "all", number> {
  return {
    all: items.length,
    stay: items.filter((i) => i.category === "stay").length,
    travel: items.filter((i) => i.category === "travel").length,
    do: items.filter((i) => i.category === "do").length,
  };
}
