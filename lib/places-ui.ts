import type { Place } from "@/packages/contracts/place";
import { getPublicEnv } from "@/lib/env";

/** Same-origin authenticated proxy for a Google photo resource name. */
export function photoProxyUrl(tripId: string, photoName: string | undefined): string | undefined {
  if (!photoName || !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) return undefined;
  return `/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(photoName)}`;
}

const PRICE_LEVEL: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

export function priceLabel(level: string | undefined): string | undefined {
  if (!level) return undefined;
  return PRICE_LEVEL[level] ?? undefined;
}

export function priceRank(level: string | undefined): number {
  const order = ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];
  const i = level ? order.indexOf(level) : -1;
  return i === -1 ? 99 : i;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Link to the chat with the composer pre-filled asking why a place/stay fits the trip.
 * Carries the address and a maps link so the user doesn't have to retype a name they
 * might not be able to read.
 */
export function askAssistantHref(
  tripId: string,
  opts: { name: string; address?: string | null; mapsUrl?: string | null; kind?: "place" | "stay"; question?: string; context?: string },
): string {
  const noun = opts.kind === "stay" ? "hotel" : "place";
  const question =
    (opts.question ?? `Why does this ${noun} fit my trip — my budget, pace, and what I've saved so far?`) +
    `\n${opts.name}${opts.address ? ` — ${opts.address}` : ""}${opts.mapsUrl ? `\n${opts.mapsUrl}` : ""}` +
    (opts.context ? `\n\nWhat's on my screen right now:\n${opts.context.slice(0, 1600)}` : "");
  return `/trips/${tripId}/chat?ask=${encodeURIComponent(question)}`;
}

/**
 * Deep link into GetYourGuide's search results for `query`, tagged with our affiliate
 * partner_id — an outbound-only link, not an API call: no live pricing or availability,
 * just the standard affiliate deep-link format from their partner docs. Returns null
 * (render nothing) until the affiliate signup is done and the id is configured.
 */
export function getYourGuideHref(query: string): string | null {
  const partnerId = getPublicEnv().NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID;
  if (!partnerId) return null;
  const q = new URLSearchParams({ q: query, partner_id: partnerId, utm_medium: "online_publisher", utm_source: "wherenext" });
  return `https://www.getyourguide.com/s/?${q.toString()}`;
}

/** Link to the full event detail page, carrying the card's data so it can paint before the fetch. */
export function eventDetailHref(
  tripId: string,
  event: { title: string; url: string; source: string; imageUrl?: string; date?: string; venue?: string },
): string {
  const q = new URLSearchParams({ name: event.title, url: event.url, source: event.source });
  if (event.imageUrl) q.set("img", event.imageUrl);
  if (event.date) q.set("date", event.date);
  if (event.venue) q.set("venue", event.venue);
  return `/trips/${tripId}/event?${q.toString()}`;
}

export function categoryLabel(category: string | null | undefined): string {
  return titleCase((category ?? "place").replaceAll("_", " "));
}

/** Google's generic container types — no signal, never worth showing. */
const GENERIC_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "premise",
  "subpremise",
  "plus_code",
  "geocode",
  "political",
  "association_or_organization",
]);

/** Readable secondary-type chips: drops the generic containers and the
 *  primary type itself, title-cases, and caps the count. */
export function secondaryTypes(primaryType: string | undefined, types: string[] | undefined, max = 4): string[] {
  const seen = new Set<string | undefined>([primaryType]);
  const out: string[] = [];
  for (const t of types ?? []) {
    if (!t || seen.has(t) || GENERIC_TYPES.has(t)) continue;
    seen.add(t);
    out.push(titleCase(t.replaceAll("_", " ")));
    if (out.length >= max) break;
  }
  return out;
}

/** Raw Google Place Details JSON — the shape returned by /api/trips/:id/places/google. */
export type GoogleReview = {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string };
  relativePublishTimeDescription?: string;
};

export type GooglePlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  editorialSummary?: { text?: string };
  regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean };
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  reviews?: GoogleReview[];
  photos?: Array<{ name?: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: "Open for business",
  CLOSED_TEMPORARILY: "Temporarily closed",
  CLOSED_PERMANENTLY: "Permanently closed",
};

export function businessStatusLabel(status: string | undefined): string | undefined {
  return status ? STATUS_LABEL[status] : undefined;
}

/** Map Google details into the `Place` shape the save endpoint expects. */
export function detailsToPlace(d: GooglePlaceDetails): Place | null {
  if (!d.id || !d.location || typeof d.location.latitude !== "number" || typeof d.location.longitude !== "number") return null;
  return {
    provider: "google-places",
    providerId: d.id,
    name: d.displayName?.text ?? "Unnamed place",
    category: d.primaryType ?? null,
    latitude: d.location.latitude,
    longitude: d.location.longitude,
    address: d.formattedAddress ?? null,
    rating: d.rating,
    userRatingCount: d.userRatingCount,
    priceLevel: d.priceLevel,
    sourceUrl: d.googleMapsUri ?? null,
    photoNames: (d.photos ?? []).map((p) => p.name).filter((n): n is string => typeof n === "string"),
  };
}
