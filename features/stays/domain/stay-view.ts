import type { StayDetails, StayReview } from "@/packages/contracts/stay";

export const facilityGroup = (facility: string) => {
  const value = facility.toLowerCase();
  if (/restaurant|bar|breakfast|coffee|room service|menu|currency/.test(value)) return "Food & drink";
  if (/accessible|lift|elevator|wheelchair|non-smoking|heating|air conditioning|wifi|wi-fi|internet|family/.test(value)) return "Comfort";
  if (/front desk|concierge|housekeeping|luggage|laundry|tour|car hire|parking|transport|meeting|banquet|fax|photocopy/.test(value)) return "Services";
  return "On site";
};

/** "family_with_children" -> "Family with children". */
export const prettyTraveller = (t?: string | null) => (t ? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");
const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
/** "se" -> "Sweden"; anything that is not a two-letter code is left as it is. */
export const prettyCountry = (c?: string | null) => {
  if (!c) return "";
  if (!/^[a-z]{2}$/i.test(c)) return c;
  try { return regionNames?.of(c.toUpperCase()) ?? c.toUpperCase(); } catch { return c.toUpperCase(); }
};
/** "WiFi available" and "Free WiFi" are one fact: keep the first of each. */
const facilityKey = (f: string) => f.toLowerCase().replace(/\b(?:free|available|complimentary)\b/g, "").replace(/[^a-z0-9]/g, "");
export const dedupeFacilities = (list: string[]) => list.filter((f, i) => list.findIndex((g) => facilityKey(g) === facilityKey(f)) === i);

/** The facilities (the first 32) sorted into the groups the page offers to open. */
export function groupFacilities(facilities: string[]): Record<string, string[]> {
  return facilities.slice(0, 32).reduce<Record<string, string[]>>((groups, facility) => {
    const group = facilityGroup(facility);
    (groups[group] ??= []).push(facility);
    return groups;
  }, {});
}

/** The facilities worth saying up front (up to eight): connectivity, comfort, food, parking. */
export const headlineFacilities = (facilities: string[]): string[] =>
  facilities.filter((facility) => /wifi|wi-fi|internet|air conditioning|heating|non-smoking|family|front desk|restaurant|room service|parking|breakfast/i.test(facility)).slice(0, 8);

/** What the reviews add up to: how many carry a score, the ones with something written, and the average score (null with none). */
export function reviewDigest(reviews: StayReview[]) {
  const rated = reviews.filter((review) => typeof review.rating === "number");
  // A score with nothing written next to it tells the reader nothing.
  const readable = reviews.filter((r) => r.headline || r.positives || r.negatives || r.text);
  const score = rated.length ? rated.reduce((total, review) => total + (review.rating ?? 0), 0) / rated.length : null;
  return { ratedCount: rated.length, readable, score };
}

/** Who wrote a review: "Family with children · Sweden", with the reviewer's name only where it is public (Google Hotels). */
export const reviewerLine = (r: StayReview, showName: boolean) => [prettyTraveller(r.travellerType), prettyCountry(r.country), showName ? r.name : null].filter(Boolean).join(" · ");

/** A Google Maps route to the hotel: by coordinates when known, else by name and address. */
export function directionsUrl(hotel: Pick<StayDetails, "latitude" | "longitude" | "address" | "city"> | null | undefined, name: string): string {
  return hotel?.latitude != null && hotel?.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${hotel.latitude},${hotel.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([name, hotel?.address, hotel?.city].filter(Boolean).join(", "))}`;
}
