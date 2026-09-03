import type { RetrievedEvidence } from "@/lib/application/retrieve";
import type { Place } from "@/packages/contracts/place";

/** Minimal valid Place for evidence fixtures. */
export function place(name: string, over: Partial<Place> = {}): Place {
  return {
    provider: "google-places",
    providerId: `g:${name.toLowerCase().replace(/\W+/g, "-")}`,
    name,
    category: "point_of_interest",
    latitude: 45.5,
    longitude: -73.57,
    address: `${name}, Somewhere`,
    rating: 4.5,
    userRatingCount: 1000,
    priceLevel: "PRICE_LEVEL_MODERATE",
    sourceUrl: `https://maps.google.com/?q=${encodeURIComponent(name)}`,
    photoNames: [],
    ...over,
  };
}

/** A full RetrievedEvidence with only the fields you pass populated. */
export function evidence(over: Partial<RetrievedEvidence> = {}): RetrievedEvidence {
  return {
    places: [],
    sources: [],
    weather: null,
    routes: [],
    events: [],
    flights: [],
    stays: [],
    unavailableProviders: [],
    retrievedAt: "2026-09-02T00:00:00.000Z",
    ...over,
  };
}

/** Every entity name present in an evidence bundle — the ground-truth set for the grounding eval. */
export function evidenceNames(e: RetrievedEvidence): string[] {
  return [
    ...e.places.map((p) => p.name),
    ...e.events.map((ev) => ev.title),
    ...e.stays.flatMap((s) => s.options.map((o) => o.name)),
    ...e.flights.flatMap((f) => f.offers.map((o) => o.airline)),
    ...e.sources.map((s) => s.title),
  ].filter(Boolean);
}
