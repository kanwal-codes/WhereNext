import type { AssistantBlock, PlaceCard } from "@/packages/contracts/assistant";
import type { MapPoint } from "@/components/TripPanelProvider";
import { coarseKind } from "@/features/places/ui/discoverTaxonomy";
import { splitRouteEnds } from "./routeText";

type Itinerary = Extract<AssistantBlock, { type: "itinerary" }>;
type Stays = Extract<AssistantBlock, { type: "stays" }>;
type Route = Extract<AssistantBlock, { type: "route_summary" }>;

const located = (lat?: number | null, lng?: number | null) => Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

const KIND_BY_CATEGORY: Record<string, MapPoint["kind"]> = { Eat: "eat", Nightlife: "do", Sight: "see", Nature: "do", Shopping: "do", Stay: "stay", Do: "do" };

export function pointsFromPlaces(places: PlaceCard[]): MapPoint[] {
  return places
    .filter((place) => located(place.latitude, place.longitude))
    .map((place) => ({ id: place.providerId, name: place.name, kind: KIND_BY_CATEGORY[coarseKind(place.category)] ?? "see", lat: place.latitude, lng: place.longitude, placeId: place.providerId }));
}

const KIND_BY_STOP: Record<string, MapPoint["kind"]> = { food: "eat", sight: "see", activity: "do", nightlife: "do", event: "event", rest: "stay" };

/** The stops of a plan that are real places (they carry a place id), in order; `dayIndex` limits it to one day. Their coordinates are looked up by the panel. */
export function pointsFromItinerary(block: Itinerary, dayIndex?: number): MapPoint[] {
  return block.days.flatMap((day, index) =>
    dayIndex !== undefined && dayIndex !== index
      ? []
      : day.stops
          .filter((stop) => stop.placeId)
          .map((stop, stopIndex) => ({ id: `${index}-${stopIndex}-${stop.placeId}`, name: stop.title, kind: KIND_BY_STOP[stop.kind ?? ""] ?? "see", placeId: stop.placeId, day: index + 1 })),
  );
}

export function pointsFromStays(items: Stays["items"]): MapPoint[] {
  return items
    .filter((hotel) => located(hotel.latitude, hotel.longitude))
    .map((hotel) => ({ id: hotel.hotelId || hotel.name, name: hotel.name, kind: "stay" as const, lat: hotel.latitude, lng: hotel.longitude }));
}

/** The two ends of a route that carries its path. */
export function pointsFromRoute(route: Route): MapPoint[] {
  const path = route.path;
  if (!path || path.length < 2) return [];
  const ends = splitRouteEnds(route.from, route.to);
  const [a, b] = [path[0], path[path.length - 1]];
  return [
    { id: "from", name: ends.from, kind: "stay", lng: a[0], lat: a[1] },
    { id: "to", name: ends.to, kind: "see", lng: b[0], lat: b[1] },
  ];
}
