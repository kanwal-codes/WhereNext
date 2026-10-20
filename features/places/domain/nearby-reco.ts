import type { NearbyEvent } from "@/lib/application/nearby-events";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { RankContext } from "@/lib/application/rank-places";
import { photoProxyUrl } from "@/lib/places-ui";
import type { Lane, LaneAnchor } from "@/packages/reco/vibes";
import type { LaneOutput } from "@/packages/reco/shape-lanes";

export type ShapedLane = LaneOutput<NearbyEvent>;
export type LogRow = { laneId: string; action: "impression" | "click"; itemKind: "place" | "event"; itemId: string; position?: number };

/** Lanes shown before "More nearby": the first two carry the point; the rest are there for whoever wants them. */
export const INITIAL_LANES = 2;

export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
export function queryFor(lane: Lane, anchor: LaneAnchor): string {
  const base = (typeof lane.query === "function" ? lane.query(anchor) : lane.query).trim();
  if (lane.source === "events") {
    // "More concerts" from a Rock gig should surface rock gigs, not worship concerts —
    // fold the anchor's genre into the keyword when we have it.
    const g = (anchor.genre ?? "").split(/\s*·\s*/).slice(1).join(" ").trim();
    return g && base ? `${base} ${g}` : base;
  }
  // A radius lane is filtered client-side, so keep its query city-wide; others lean on the anchor.
  return lane.radiusKm ? `${base} in ${anchor.city}`.trim() : `${base} near ${anchor.name} ${anchor.city}`.trim();
}

/** Only the cards actually rendered (the same `slice(0, 4)` the JSX applies) count as an "impression". */
export const impressionRows = (lanes: ShapedLane[]): LogRow[] =>
  lanes.flatMap(({ lane, places, events }) => {
    const shownPlaces = places.slice(0, 4);
    const shownEvents = events.slice(0, Math.max(0, 4 - shownPlaces.length));
    return [
      ...shownPlaces.map((r, idx): LogRow => ({ laneId: lane.id, action: "impression", itemKind: "place", itemId: r.place.providerId, position: idx })),
      ...shownEvents.map((e, idx): LogRow => ({ laneId: lane.id, action: "impression", itemKind: "event", itemId: e.url, position: idx })),
    ];
  });

/** The traveller-fit signals the ranker uses, from the trip's preferences, shortlist and (if any) confirmed stay. */
export function rankContextFrom(input: { prefs: Record<string, unknown> | undefined; savedPlaces: unknown[] | undefined; rejectedPlaceIds: string[] | undefined; stayLat: number | null; stayLng: number | null }): Omit<RankContext, "anchor"> {
  const { prefs, savedPlaces, rejectedPlaceIds, stayLat, stayLng } = input;
  const savedIds = (savedPlaces ?? [])
    .map((row) => {
      const rec = row as { places?: { provider_id?: string }; provider_id?: string };
      return rec.places?.provider_id ?? rec.provider_id;
    })
    .filter((id): id is string => Boolean(id));
  return {
    interests: asList(prefs?.interests),
    likes: asList(prefs?.likes),
    dislikes: asList(prefs?.dislikes),
    savedIds,
    rejectedIds: rejectedPlaceIds ?? [],
    stayAnchor: stayLat != null && stayLng != null ? { latitude: stayLat, longitude: stayLng } : null,
  };
}

/** What "See more" opens for a lane: its events, or its places with their photos resolved. */
export function collectionBlockFor(tripId: string, lane: Lane, places: ShapedLane["places"], events: NearbyEvent[]): AssistantBlock {
  return events.length > 0
    ? ({
        type: "events",
        retrievedAt: new Date().toISOString(),
        items: events,
      } as AssistantBlock)
    : ({
        type: "place_list",
        title: lane.title,
        // The collection panel's PlaceCardView reads `photoUrl` (a resolved proxy URL), not
        // the raw `photoNames` this Place carries — without this every card falls back to
        // the pin-icon placeholder.
        places: places.map((result) => ({ ...result.place, photoUrl: photoProxyUrl(tripId, result.place.photoNames?.[0], 480) })),
      } as AssistantBlock);
}
