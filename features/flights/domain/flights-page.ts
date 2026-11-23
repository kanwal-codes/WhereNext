import { placeName } from "@/lib/place-label";

/** What the Flights page needs to know that is not about drawing: the search a trip starts from, how it reads in a pill, and where people fly. */

export type FlightDraft = { fromLabel: string; toLabel: string; depart: string | null; ret: string | null; adults: number };

export const MAX_TRAVELLERS = 9;

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const tomorrow = (now = new Date()) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
/** "Toronto, Ontario, Canada" is "Toronto": the part a person says. */
export const shortPlace = placeName;
const clampTravellers = (n: number | null | undefined) => Math.min(MAX_TRAVELLERS, Math.max(1, Math.round(n ?? 1) || 1));

/** A destination that is one place ("Lisbon, Portugal"), or "": an itinerary written out ("Portugal, then Morocco") is not somewhere to fly to. */
const singlePlace = (destination: string | null | undefined) => {
  const d = destination?.trim() ?? "";
  return /\s(then|and|&|\+|to)\s|→|->|;/i.test(d) ? "" : d;
};

/**
 * The search a trip begins with: from where it starts, to where it goes, on the days it has. Only days still ahead count (the providers are asked
 * about the future only), and a return needs a start. Nothing is searched from this: it fills the sheet, which asks once and then searches.
 */
export function draftFromTrip(trip: { origin?: string | null; destination?: string | null; start_date?: string | null; end_date?: string | null; travelers?: number | null } | null | undefined, now = new Date()): FlightDraft {
  const first = tomorrow(now);
  const depart = trip?.start_date && trip.start_date >= first ? trip.start_date : null;
  const ret = depart && trip?.end_date && trip.end_date > depart ? trip.end_date : null;
  return { fromLabel: trip?.origin?.trim() ?? "", toLabel: singlePlace(trip?.destination), depart, ret, adults: clampTravellers(trip?.travelers) };
}

/** Enough to ask: somewhere to leave from, somewhere to go, and the day. A return is optional (a one-way trip has none). */
export const canSearch = (d: FlightDraft) => Boolean(d.fromLabel.trim() && d.toLabel.trim() && d.depart);

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });
/** "Dec 31 – Jan 10", "Dec 31" for one way, or null with no day yet. */
export const datesLine = (depart: string | null, ret: string | null) => (depart ? (ret ? `${day(depart)} – ${day(ret)}` : day(depart)) : null);
export const travellersLine = (n: number) => `${n} traveller${n === 1 ? "" : "s"}`;
export const routeLine = (from: string, to: string) => `${shortPlace(from)} to ${shortPlace(to)}`;

/** Cities people fly to from most places: shown as ideas, never as prices (a price needs a real search, which costs one). */
const WORLD = ["Lisbon, Portugal", "Tokyo, Japan", "Mexico City, Mexico", "Paris, France", "London, United Kingdom", "New York, United States", "Rome, Italy", "Reykjavik, Iceland"];

/** The trip's own destination first (the likeliest search), then the usual places, without where you are leaving from. */
export function ideasFor({ origin, destination }: { origin?: string | null; destination?: string | null }, limit = 6): string[] {
  const same = (a: string, b: string) => shortPlace(a).toLowerCase() === shortPlace(b).toLowerCase();
  const out: string[] = [];
  const add = (place: string | null | undefined) => {
    const p = place?.trim();
    if (!p || (origin && same(p, origin)) || out.some((o) => same(o, p))) return;
    out.push(p);
  };
  add(destination);
  for (const place of WORLD) add(place);
  return out.slice(0, limit);
}

/**
 * What the fares on screen say about the airlines an ask named ("Air Canada or Flair?"): the cheapest fare of each, or that it has none in these results.
 * It is built from the results, so it never says anything the fares do not.
 */
export function airlineNote(
  names: string[],
  offers: { airline: string; price: string; stops: number; durationMinutes: number }[],
  show: { money: (price: number) => string; duration: (minutes: number) => string },
): string | null {
  const parts = names.map((name) => name.trim()).filter(Boolean).map((name) => {
    const mine = offers.filter((o) => o.airline.toLowerCase().includes(name.toLowerCase()));
    if (!mine.length) return `${name} has no flights in these results.`;
    const price = (o: { price: string }) => Number(o.price) || Number.POSITIVE_INFINITY;
    const best = mine.reduce((a, b) => (price(b) < price(a) || (price(b) === price(a) && b.durationMinutes < a.durationMinutes) ? b : a));
    return `${name} from ${show.money(price(best))}, ${best.stops === 0 ? "nonstop" : `${best.stops} stop${best.stops > 1 ? "s" : ""}`}, ${show.duration(best.durationMinutes)}.`;
  });
  return parts.length ? parts.join(" ") : null;
}
