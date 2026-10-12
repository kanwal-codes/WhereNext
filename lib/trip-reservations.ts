import { formatMoney } from "@/lib/currency";
import { daysUntilTrip } from "@/lib/trip-dates";
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
  /** Files attached to the reservation (tickets, vouchers); 0 for rows that are not hand-entered. */
  fileCount: number;
  /**
   * What taking this row off the trip deletes: the hand-entered reservation, or the locked stay / flight choice.
   * Null for anything a provider order backs: a confirmed booking is cancelled from its details, never just deleted.
   */
  removal: { type: "reservation" } | { type: "decision"; kind: "stay" | "flight" } | null;
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
      fileCount: 0,
      removal: booking ? null : { type: "decision", kind: "stay" },
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
      fileCount: 0,
      removal: booking ? null : { type: "decision", kind: "flight" },
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
      fileCount: 0,
      removal: null,
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
      fileCount: r.attachments.length,
      removal: { type: "reservation" },
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

/**
 * The row to feature: the first dated one that has not finished yet. A stay you are in right now
 * counts (it runs until check-out); rows with no date never do. `items` must already be in date order.
 */
export function pickNextUp(items: TimelineItem[], now: number = Date.now()): TimelineItem | null {
  return items.find((item) => item.date !== null && (daysUntilTrip(item.endDate ?? item.date, now) ?? -1) >= 0) ?? null;
}

/** "Today", "Tomorrow", "In 12 days", or "Now" for a multi-day row already under way. */
export function whenLabel(item: TimelineItem, now: number = Date.now()): string | null {
  const start = daysUntilTrip(item.date, now);
  if (start === null) return null;
  if (start < 0) return item.endDate && (daysUntilTrip(item.endDate, now) ?? -1) >= 0 ? "Now" : null;
  return start === 0 ? "Today" : start === 1 ? "Tomorrow" : `In ${start} days`;
}

export type DayBooking = { reservation: Reservation; /** "Check-in" / "Check-out" for a multi-day stay, otherwise null. */ note: string | null };

/** 1-based trip day for a calendar date, counting from `startDate`; null when either is missing or the date is before the trip. */
export function tripDayFor(date: string | null, startDate: string | null | undefined): number | null {
  if (!date || !startDate) return null;
  const a = new Date(`${startDate}T00:00:00`).getTime();
  const b = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const day = Math.round((b - a) / 86_400_000) + 1;
  return day >= 1 ? day : null;
}

/**
 * Reservations placed on the trip's days, so the Itinerary shows what is already booked next to what is
 * planned. A reservation with an end date ("check-out") also appears on that day. Undated ones, and
 * ones before the trip starts, are not on any day.
 */
export type DayConflict = { day: number; a: string; b: string; at: string };

const timeMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const CONFLICT_WINDOW_MINUTES = 60;

/**
 * Same-day stops and reservations whose clock times land within an hour of each other — a
 * heads-up that two things are stacked close together. Itinerary stops and most reservations
 * carry no duration, so this flags proximity, not a true calendar overlap.
 */
export function findScheduleConflicts(
  itineraryItems: Array<{ day_index: number; title: string; metadata?: Record<string, unknown> | null }>,
  reservations: Reservation[],
  startDate: string | null | undefined,
): DayConflict[] {
  type Timed = { day: number; title: string; time: string };
  const timed: Timed[] = [];
  for (const item of itineraryItems) {
    const time = typeof item.metadata?.time === "string" ? item.metadata.time : null;
    if (time) timed.push({ day: item.day_index, title: item.title, time });
  }
  for (const r of reservations) {
    const day = tripDayFor(r.startsOn, startDate);
    if (day !== null && r.startTime) timed.push({ day, title: r.title, time: r.startTime });
  }

  const byDay = new Map<number, Timed[]>();
  for (const t of timed) byDay.set(t.day, [...(byDay.get(t.day) ?? []), t]);

  const conflicts: DayConflict[] = [];
  for (const [day, list] of byDay) {
    const sorted = list.slice().sort((a, b) => a.time.localeCompare(b.time));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (a.title === b.title) continue;
      if (timeMinutes(b.time) - timeMinutes(a.time) <= CONFLICT_WINDOW_MINUTES) conflicts.push({ day, a: a.title, b: b.title, at: a.time });
    }
  }
  return conflicts;
}

export function reservationsByDay(reservations: Reservation[], startDate: string | null | undefined): Map<number, DayBooking[]> {
  const byDay = new Map<number, DayBooking[]>();
  const add = (day: number | null, entry: DayBooking) => {
    if (day === null) return;
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  };
  for (const reservation of reservations) {
    const first = tripDayFor(reservation.startsOn, startDate);
    const last = tripDayFor(reservation.endsOn, startDate);
    const multiDay = first !== null && last !== null && last > first;
    add(first, { reservation, note: multiDay ? "Check-in" : null });
    if (multiDay) add(last, { reservation, note: "Check-out" });
  }
  for (const [day, list] of byDay) {
    byDay.set(day, list.sort((a, b) => (a.reservation.startTime ?? "99:99").localeCompare(b.reservation.startTime ?? "99:99")));
  }
  return byDay;
}
