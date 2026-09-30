import type { Place } from "@/packages/contracts/place";
import { getPublicEnv } from "@/lib/env";

/** Same-origin authenticated proxy for a Google photo resource name. */
/** Ask the photo proxy for a smaller rendition (thumbnails); any other URL is returned untouched. */
export function withPhotoWidth(url: string, width: number): string {
  return url.includes("/places/google/photo?") && !url.includes("&w=") ? `${url}&w=${width}` : url;
}

export function photoProxyUrl(tripId: string, photoName: string | undefined, width?: number): string | undefined {
  if (!photoName || !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) return undefined;
  return `/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(photoName)}${width ? `&w=${width}` : ""}`;
}

/**
 * Rough "City, Country" from a Google formatted address (no structured `addressComponents` are
 * fetched from the Places API, only the single `formattedAddress` string). Used to bias a
 * "nearby" places/events search, so getting the actual city matters.
 *
 * Live-testing regression (2026-09-16): the old version just took the address's last two
 * comma-separated segments, assuming "..., City, Country" — true for a 3-segment address, but a
 * North American one is usually 4 segments ("Street, City, Region PostalCode, Country"), so it
 * silently grabbed "Region PostalCode, Country" instead (e.g. "QC H2X 2T6, Canada" for a
 * Montreal address) — confirmed live to pull in wrong-city results (Quebec City sights on a
 * Montreal trip) and roughly halve the candidate count for every citywide lane on the page.
 *
 * Fix: walk backward from the segment before the country, skipping any segment that's a bare
 * region/postal-code blob (all caps and digits, no lowercase letters — "QC H2X 2T6", "NY 10012")
 * rather than an actual place name. A segment WITH lowercase letters is kept as the city, and a
 * postal code glued onto the front of it in the same segment ("75001 Paris") is stripped off.
 */
export function cityFrom(address: string | undefined | null): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const country = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    if (!/[a-z]/.test(parts[i])) continue; // no lowercase letters → a region/postal code, not a name
    const city = parts[i].replace(/^[\d-]+\s*/, "");
    if (city) return `${city}, ${country}`;
  }
  return country;
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
  "service",
  "food",
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
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  servesCocktails?: boolean;
  goodForGroups?: boolean;
  goodForChildren?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  reservable?: boolean;
  allowsDogs?: boolean;
};

const AMENITY_LABEL: Array<[keyof GooglePlaceDetails, string]> = [
  ["outdoorSeating", "Outdoor seating"],
  ["liveMusic", "Live music"],
  ["servesCocktails", "Serves cocktails"],
  ["reservable", "Reservable"],
  ["goodForGroups", "Good for groups"],
  ["goodForChildren", "Good for kids"],
  ["allowsDogs", "Dog friendly"],
  ["dineIn", "Dine-in"],
  ["takeout", "Takeout"],
  ["delivery", "Delivery"],
];

/** Amenity chips actually true on this place, e.g. "Outdoor seating", "Reservable". */
export function amenityChips(d: GooglePlaceDetails): string[] {
  return AMENITY_LABEL.filter(([key]) => d[key] === true).map(([, label]) => label);
}

/** Only a status that changes the plan is worth a label: "open for business" is what every place is by default. */
const STATUS_LABEL: Record<string, string> = {
  CLOSED_TEMPORARILY: "Temporarily closed",
  CLOSED_PERMANENTLY: "Permanently closed",
};

export function businessStatusLabel(status: string | undefined): string | undefined {
  return status ? STATUS_LABEL[status] : undefined;
}

/** A link's readable form: host and path, no scheme, no `www.`, no tracking query. */
export function prettyWebsite(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  }
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

/** "2026-10-10" → "Sat, Oct 10"; "2026-09-30 18:30" → "Wed, Sep 30 · 6:30 PM". Anything else is returned untouched. */
export function formatEventWhen(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return raw;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0);
  if (Number.isNaN(d.getTime())) return raw;
  const day = d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
  return m[4] && !(m[4] === "00" && m[5] === "00") ? `${day} · ${d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}` : day;
}
