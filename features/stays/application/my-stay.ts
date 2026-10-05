import { formatMoney } from "@/lib/currency";
import type { TimelineItem } from "@/lib/trip-reservations";
import type { StayDecision } from "@/packages/contracts/stay";

/** One stay on the trip, however it got there: a chosen hotel, a provider booking, or a reservation typed in by hand. */
export type MyStay = {
  id: string;
  name: string;
  address: string | null;
  /** "Booking via Bakal Tulum Hotel", the room, the board, or the reservation's note. */
  note: string | null;
  refundable: boolean;
  thumbnail: string | null;
  /** The small chip over the photo. */
  badge: string;
  checkin: string | null;
  checkout: string | null;
  nights: number | null;
  total: string | null;
  perNight: string | null;
  href: string;
};

const DAY = 86_400_000;
export const nightsBetween = (checkin: string | null, checkout: string | null): number | null => {
  if (!checkin || !checkout) return null;
  const n = Math.round((Date.parse(`${checkout}T00:00:00`) - Date.parse(`${checkin}T00:00:00`)) / DAY);
  return n > 0 ? n : null;
};

/** "Booking on Bakal Tulum Hotel" is how a Google Hotels lock records the site it will be booked on. */
export const viaNote = (room: string) => (/^Booking on /i.test(room) ? `Booking via ${room.replace(/^Booking on /i, "")}` : room);

export function myStayFromDecision(stay: StayDecision, href: string): MyStay {
  return {
    id: `stay:${stay.hotelId}`,
    name: stay.hotelName,
    address: stay.address,
    note: [viaNote(stay.roomName), stay.board].filter(Boolean).join(" · ") || null,
    refundable: stay.refundable,
    thumbnail: stay.thumbnail,
    badge: "Your stay",
    checkin: stay.checkin,
    checkout: stay.checkout,
    nights: stay.nights,
    total: formatMoney(stay.totalAmount, stay.currency),
    perNight: stay.nightlyAmount > 0 ? `${formatMoney(stay.nightlyAmount, stay.currency)} / night` : null,
    href,
  };
}

/** A stay row from the Bookings list, shown the same way: the chosen hotel keeps its own page; the rest lead to Bookings, where they are edited. */
export function myStayFromTimeline(item: TimelineItem, tripId: string): MyStay {
  const chosen = item.removal?.type === "decision";
  return {
    id: item.id,
    name: item.title,
    address: item.place,
    note: item.subtitle ? viaNote(item.subtitle) : null,
    refundable: false,
    thumbnail: item.thumbnail,
    badge: chosen ? "Your stay" : item.bookingId ? "Booked" : "Reserved",
    checkin: item.date,
    checkout: item.endDate,
    nights: nightsBetween(item.date, item.endDate),
    total: item.amountLabel,
    perNight: null,
    href: item.href ?? `/trips/${tripId}/bookings`,
  };
}
