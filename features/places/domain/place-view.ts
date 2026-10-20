import type { GooglePlaceDetails, GoogleReview } from "@/lib/places-ui";

/** Google lists Monday first: the index of `now`'s weekday in that list. */
export const todayIndex = (now: Date = new Date()) => (now.getDay() + 6) % 7;

/** Today's hours without the weekday ("9:00 AM – 9:45 PM"), or null with no hours. */
export function todayHoursOf(hours: string[], now: Date = new Date()): string | null {
  return hours.length ? (hours[todayIndex(now)] ?? hours[0]).replace(/^[^:]+:\s*/, "") : null;
}

/** One "Monday: 9:00 AM – 6:00 PM" line as its day and its hours. */
export function splitHoursLine(line: string): [string, string] {
  const [day, ...rest] = line.split(": ");
  return [day, rest.join(": ")];
}

/** Any wheelchair provision at all is worth saying; "false" for each is not. */
export const wheelchairAccessible = (a11y: GooglePlaceDetails["accessibilityOptions"]): boolean =>
  Boolean(a11y && (a11y.wheelchairAccessibleEntrance || a11y.wheelchairAccessibleParking || a11y.wheelchairAccessibleRestroom || a11y.wheelchairAccessibleSeating));

/** The reviews with something written, at most four. */
export const usableReviews = (reviews: GoogleReview[] | undefined): GoogleReview[] =>
  (reviews ?? []).filter((r) => r.text?.text || r.originalText?.text).slice(0, 4);

/** A Google Maps route to the place, pinned to its Google place id. */
export const placeDirectionsUrl = (name: string, address: string | undefined, placeId: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([name, address].filter(Boolean).join(", "))}&destination_place_id=${encodeURIComponent(placeId)}`;

/** A phone number as a tel: link. */
export const telHref = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;

/** "Open until 9:45 PM", "Open now" or "Closed now" for the phone's chip; null when open/closed is not known. */
export function openNowChip(openNow: boolean | undefined, todayHours: string | null): string | null {
  if (typeof openNow !== "boolean") return null;
  return openNow ? `Open${todayHours?.includes("–") ? ` until ${todayHours.split("–").pop()?.trim()}` : " now"}` : "Closed now";
}
