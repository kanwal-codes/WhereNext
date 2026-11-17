import type { AiSearchDirective } from "@/lib/application/ai-search";
import type { StayFacets, StayOption } from "@/packages/contracts/stay";

export type StaySort = "price" | "price_desc" | "rating" | "stars";

/** What the stay search endpoint answers with. */
export type StaySearchResult = {
  location: string;
  checkin: string;
  checkout: string;
  assumedDates: boolean;
  nights: number;
  adults: number;
  rooms: number;
  currency: string;
  options: StayOption[];
  facets: StayFacets;
  /** How many hotels the first search priced, before any filter. */
  total?: number;
  /** The first search stopped at its limit, so a deeper one with the filters can find more. */
  capped?: boolean;
  /** This answer came from that deeper search. */
  deep?: boolean;
};

/** Why a search could not be answered, said in the words the screen uses for it. */
export type StaySearchError = { kind: "offline" | "unavailable"; message: string };
const OFFLINE_MESSAGE = "You're offline. Reconnect and the hotels will load.";
const UNAVAILABLE_MESSAGE = "The hotel sites aren't answering right now. Try again in a moment.";
export const staySearchError = (kind: StaySearchError["kind"]): StaySearchError => ({ kind, message: kind === "offline" ? OFFLINE_MESSAGE : UNAVAILABLE_MESSAGE });

/** Fewer matches than this from the first page, and a deeper search with the filters is worth its wait. */
export const DEEP_BELOW = 6;

/** The party the search starts with: the trip's travellers, from one to 24. */
export const initialAdults = (travelers: number | null | undefined) => Math.max(1, Math.min(travelers ?? 2, 24));

/** Nights between two ISO days; 0 when either is missing. */
export const nightsBetween = (checkin: string, checkout: string) =>
  checkin && checkout ? Math.round((Date.parse(`${checkout}T00:00:00`) - Date.parse(`${checkin}T00:00:00`)) / 864e5) : 0;

export const nightsText = (nights: number) => (nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "");

export type StayQuery = {
  adults: number;
  rooms: number;
  sort: StaySort;
  /** A place Roam was asked to search near; wins over the city picked. */
  near: string;
  /** The city picked on a multi-city trip (empty on a one-city trip). */
  city: string;
  checkin: string;
  checkout: string;
  stars: number[];
  boards: string[];
  propertyTypes: string[];
  refundable: boolean;
  priceMin: number | null;
  priceMax: number | null;
};

/** The search endpoint's query string for these choices. */
export function stayQueryString(q: StayQuery): string {
  const qs = new URLSearchParams({ adults: String(q.adults), rooms: String(q.rooms), sort: q.sort });
  if (q.near.trim()) qs.set("location", q.near.trim());
  else if (q.city) qs.set("location", q.city);
  if (q.checkin) qs.set("checkin", q.checkin);
  if (q.checkout) qs.set("checkout", q.checkout);
  if (q.stars.length) qs.set("stars", q.stars.join(","));
  if (q.boards.length) qs.set("boards", q.boards.join(","));
  if (q.propertyTypes.length) qs.set("propertyTypes", q.propertyTypes.join(","));
  if (q.refundable) qs.set("refundable", "1");
  if (q.priceMin) qs.set("priceMin", String(q.priceMin));
  if (q.priceMax) qs.set("priceMax", String(q.priceMax));
  return qs.toString();
}

/** What a Roam search directive changes, with party size kept within what the steppers allow. */
export type DirectivePatch = Partial<{ checkin: string; checkout: string; nights: number; near: string; priceMin: number | null; priceMax: number | null; stars: number[]; boards: string[]; propertyTypes: string[]; refundable: boolean; sort: StaySort; adults: number; rooms: number }>;
export function directivePatch(d: AiSearchDirective): DirectivePatch {
  const patch: DirectivePatch = {};
  if (d.location !== undefined) patch.near = d.location;
  if (d.checkin && d.checkout) { if (d.checkout > d.checkin) { patch.checkin = d.checkin; patch.checkout = d.checkout; } }
  // A start with no end, or a number of nights with no start: the other half is what the screen already has.
  else if (d.checkin) { patch.checkin = d.checkin; if (d.nights) patch.nights = d.nights; }
  else if (d.nights) patch.nights = d.nights;
  // A new price ask replaces the old one whole: "under 150" after "between 100 and 200" must not keep the 100.
  if (d.priceMax !== undefined || d.priceMin !== undefined) { patch.priceMax = d.priceMax ?? null; patch.priceMin = d.priceMin ?? null; }
  if (d.stars?.length) patch.stars = d.stars;
  if (d.boards?.length) patch.boards = d.boards;
  if (d.propertyTypes?.length) patch.propertyTypes = d.propertyTypes;
  if (d.refundable !== undefined) patch.refundable = d.refundable;
  if (d.sort) patch.sort = d.sort;
  if (d.adults) patch.adults = Math.max(1, Math.min(d.adults, 16));
  if (d.rooms) patch.rooms = Math.max(1, Math.min(d.rooms, 8));
  return patch;
}

/** The list with `v` added, or taken out when it was already there. */
export const toggled = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** How many filters are on (each star, board and type counts; so do free cancellation and a price cap). */
export const activeFilterCount = (f: Pick<StayQuery, "stars" | "boards" | "propertyTypes" | "refundable" | "priceMin" | "priceMax">) =>
  f.stars.length + f.boards.length + f.propertyTypes.length + (f.refundable ? 1 : 0) + (f.priceMin || f.priceMax ? 1 : 0);

/** A booked stay that covers some of these nights: said up front, so nobody pays for the same nights twice. */
export function overlappingStay<T extends { date?: string | null; endDate?: string | null; status?: string | null }>(items: T[], checkin: string, checkout: string): T | undefined {
  return items.find((item) => item.date && checkin && checkout && item.date < checkout && (item.endDate ?? item.date) > checkin && item.status !== "cancelled");
}

/** A hotel as the comparison panel lists it. */
export function stayCompareEntry(o: StayOption, href: string, money: (n: number) => string) {
  const rated = typeof o.rating === "number" && o.rating > 0;
  return {
    id: o.hotelId, kind: "stay" as const, name: o.name, href,
    subtitle: [o.stars ? `${o.stars}★` : null, o.boardName].filter(Boolean).join(" · ") || undefined,
    attrs: {
      price: `${money(o.nightlyAmount)}/night`, priceValue: o.nightlyAmount,
      rating: rated ? `${o.rating!.toFixed(1)}/10` : undefined, ratingValue: rated ? o.rating! : undefined,
      lat: o.latitude ?? undefined, lng: o.longitude ?? undefined,
      detail: [o.stars ? `${o.stars}-star` : null, o.boardName, o.refundable ? "free cancellation" : null].filter(Boolean).join(", ") || "Hotel",
    },
  };
}
