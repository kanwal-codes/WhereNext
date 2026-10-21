import { nearest } from "@/lib/application/geo";
import { priceRank, type GooglePlaceDetails } from "@/lib/places-ui";
import { readStayDecision } from "@/packages/contracts/stay";

const BASE_ROWS = [
  { key: "category", label: "Type" },
  { key: "rating", label: "Rating" },
  { key: "reviews", label: "Reviews" },
  { key: "price", label: "Price" },
  { key: "hours", label: "Hours" },
  { key: "source", label: "Source" },
] as const;
export type CompareRowKey = (typeof BASE_ROWS)[number]["key"] | "distance";
export type CompareRow = { key: CompareRowKey; label: string };

type Anchor = { title: string; latitude: number; longitude: number };

const numberAt = (metadata: unknown, key: "latitude" | "longitude"): number | undefined => {
  const value = (metadata as Record<string, unknown> | null)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/**
 * Distance anchors, most specific first: the locked stay, else the trip's own locked itinerary
 * items (a confirmed dinner reservation, a booked tour — real committed plans, not just
 * anything saved). A place's distance is to whichever of these it's nearest, since with more
 * than one locked anchor there's no single "the" base to measure from — matches how `why`
 * reasoning elsewhere in the app ("Near where you're staying") already treats proximity.
 */
export function compareAnchors(decisions: Array<{ kind: string; value: unknown }>, itinerary: Array<{ title?: unknown; metadata?: unknown }>): { anchors: Anchor[]; distanceLabel: string | null } {
  const lockedStay = readStayDecision(decisions);
  const stayAnchor = lockedStay?.latitude != null && lockedStay?.longitude != null
    ? [{ title: lockedStay.hotelName, latitude: lockedStay.latitude, longitude: lockedStay.longitude }]
    : [];
  const lockedItineraryAnchors = itinerary
    .filter((item) => (item.metadata as Record<string, unknown> | null)?.locked === true)
    .flatMap((item) => {
      const latitude = numberAt(item.metadata, "latitude");
      const longitude = numberAt(item.metadata, "longitude");
      return typeof item.title === "string" && latitude !== undefined && longitude !== undefined
        ? [{ title: item.title, latitude, longitude }]
        : [];
    });
  const anchors = stayAnchor.length ? stayAnchor : lockedItineraryAnchors;
  return { anchors, distanceLabel: stayAnchor.length ? "From your stay" : anchors.length ? "From your plans" : null };
}

/** The table's rows, with the distance row slotted in before Hours when there is something to measure from. */
export function compareRows(distanceLabel: string | null): readonly CompareRow[] {
  return distanceLabel ? [...BASE_ROWS.slice(0, 4), { key: "distance" as const, label: distanceLabel }, ...BASE_ROWS.slice(4)] : BASE_ROWS;
}

/** Which pick wins at what: the best rating, the lowest price, the most reviews, the shortest distance (−1 or 99 when nobody has one). */
export function compareStats(places: GooglePlaceDetails[], anchors: Anchor[]) {
  const rated = places.filter((d) => typeof d.rating === "number");
  const reviewed = places.filter((d) => typeof d.userRatingCount === "number");
  const distanceKm = (d: GooglePlaceDetails): number | null =>
    anchors.length && d.location?.latitude != null && d.location?.longitude != null
      ? nearest({ latitude: d.location.latitude, longitude: d.location.longitude }, anchors)?.km ?? null
      : null;
  const distanced = places.map(distanceKm).filter((km): km is number => km !== null);
  return {
    bestRating: rated.length ? Math.max(...rated.map((d) => d.rating as number)) : -1,
    bestPrice: Math.min(...places.map((d) => priceRank(d.priceLevel))),
    mostReviews: reviewed.length ? Math.max(...reviewed.map((d) => d.userRatingCount as number)) : -1,
    closestKm: distanced.length ? Math.min(...distanced) : -1,
    distanceKm,
  };
}
export type CompareStats = ReturnType<typeof compareStats>;

/** Today's line from the weekly hours ("Wednesday: 10:00 AM – 8:00 PM"), or "See listing" when the place does not give them. */
export function hoursToday(d: GooglePlaceDetails, now: Date = new Date()): string {
  return d.regularOpeningHours?.weekdayDescriptions?.[now.getDay() === 0 ? 6 : now.getDay() - 1] ?? "See listing";
}

/** The same line for a narrow column: no weekday, and times that do not break between the number and AM/PM. */
export const hoursTodayShort = (d: GooglePlaceDetails, now?: Date): string => hoursToday(d, now).replace(/^[^:]+:\s*/, "").replace(/\s(AM|PM)/g, " $1");
