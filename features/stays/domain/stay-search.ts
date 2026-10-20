import type { AiSearchDirective } from "@/lib/application/ai-search";
import type { StayFacets, StayOption } from "@/packages/contracts/stay";

export type StaySort = "price" | "rating" | "stars";

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
};

const NOTHING_MATCHED = "Nothing matched — loosen the filters or change the dates.";
export const SEARCH_FAILED = "We couldn't load hotels just now. Try again in a moment.";
export const searchFailed = (status: string) => status.startsWith("We couldn't");

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
  if (q.priceMax) qs.set("priceMax", String(q.priceMax));
  return qs.toString();
}

/** The message under the filters for a result list: empty when there is something to show. */
export const statusFor = (result: Pick<StaySearchResult, "options">) => ((result.options ?? []).length === 0 ? NOTHING_MATCHED : "");

/** What a Roam search directive changes, with party size kept within what the steppers allow. */
export type DirectivePatch = Partial<{ near: string; priceMax: number | null; stars: number[]; boards: string[]; propertyTypes: string[]; refundable: boolean; sort: StaySort; adults: number; rooms: number }>;
export function directivePatch(d: AiSearchDirective): DirectivePatch {
  const patch: DirectivePatch = {};
  if (d.location !== undefined) patch.near = d.location;
  if (d.priceMax !== undefined) patch.priceMax = d.priceMax;
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
export const activeFilterCount = (f: Pick<StayQuery, "stars" | "boards" | "propertyTypes" | "refundable" | "priceMax">) =>
  f.stars.length + f.boards.length + f.propertyTypes.length + (f.refundable ? 1 : 0) + (f.priceMax ? 1 : 0);

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
