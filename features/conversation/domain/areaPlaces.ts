/** What a card's tags can search for. A tag like "walkable" describes the feel of a place, not something to look up. */
const CATEGORIES: Array<{ match: RegExp; label: string; query: string }> = [
  { match: /\b(shop|shops|shopping|boutiques?|vintage|fashion|secondhand|thrift)\b/i, label: "Shopping", query: "shops and boutiques" },
  { match: /\b(bistros?|restaurants?|food|foodie|dining|gastronomy|eateries|wine)\b/i, label: "Food", query: "restaurants and bistros" },
  { match: /\b(cafes?|cafés?|coffee|brunch|bakery|bakeries|patisserie)\b/i, label: "Cafés", query: "cafés and bakeries" },
  { match: /\b(nightlife|bars?|clubs?|cocktails?|pubs?|live music|music)\b/i, label: "Nightlife", query: "bars and cocktail bars" },
  { match: /\b(museums?|art|galleries|gallery|culture|cultural|history|historic|architecture)\b/i, label: "Culture", query: "museums and galleries" },
  { match: /\b(parks?|gardens?|nature|green|outdoors?|river|waterfront|beach|beaches|hiking)\b/i, label: "Outdoors", query: "parks and gardens" },
  { match: /\b(views?|viewpoints?|panoramic|sunsets?)\b/i, label: "Views", query: "viewpoints" },
  { match: /\b(sights?|landmarks?|monuments?|churches|cathedrals?|temples?)\b/i, label: "Sights", query: "sights and landmarks" },
  { match: /\b(markets?)\b/i, label: "Markets", query: "markets" },
  { match: /\b(family|kids|children)\b/i, label: "With kids", query: "family friendly things to do" },
];

export type PlaceTab = { key: string; label: string; query: string };

/**
 * The searches an area or day-trip card offers, from its tags: "Top picks" first, then one tab per tag that names something
 * to look up (the same category from two tags is one tab). A card whose tags are all qualities still gets food and sights.
 */
export function placeTabs(tags: string[], kind: "area" | "daytrip"): PlaceTab[] {
  const tabs: PlaceTab[] = [{ key: "top", label: "Top picks", query: kind === "area" ? "best things to do" : "best things to see and do" }];
  const seen = new Set<string>();
  for (const tag of tags) {
    const category = CATEGORIES.find((c) => c.match.test(tag));
    if (!category || seen.has(category.query)) continue;
    seen.add(category.query);
    tabs.push({ key: category.query, label: tag.trim() ? tag.trim().replace(/^./, (c) => c.toUpperCase()) : category.label, query: category.query });
  }
  if (tabs.length === 1) {
    tabs.push({ key: "restaurants and cafés", label: "Eat & drink", query: "restaurants and cafés" }, { key: "sights and landmarks", label: "Sights", query: "sights and landmarks" });
  }
  return tabs.slice(0, 6);
}

/** The words that describe an area's character rather than something to search for: shown as a quiet line, not as tabs. */
export function feelTags(tags: string[]): string[] {
  return tags.filter((tag) => !CATEGORIES.some((c) => c.match.test(tag)));
}

/** The middle of a set of places, for centring a map on an area the search found places in. Null when there are none. */
export function centroid(points: Array<{ latitude: number; longitude: number }>): { lat: number; lng: number } | null {
  if (points.length === 0) return null;
  const lat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p.longitude, 0) / points.length;
  return { lat, lng };
}

/** A circle around a point as a closed line of [lng, lat], for drawing "about this far" on a map. */
export function ringPoints(lat: number, lng: number, radiusMeters: number, steps = 48): Array<[number, number]> {
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (2 * Math.PI * i) / steps;
    return [Number((lng + dLng * Math.cos(angle)).toFixed(6)), Number((lat + dLat * Math.sin(angle)).toFixed(6))] as [number, number];
  });
}

/** "Le Marais (3rd/4th)" → "Le Marais": what to put in a search so it is the neighbourhood and not the arrondissement note. */
export function searchName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() || name;
}

/** Straight-line distance between two points, in kilometres. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(a.latitude - b.lat);
  const dLng = rad(a.longitude - b.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(b.lat)) * Math.cos(rad(a.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Only what is actually in the area. A search for "things to do in Le Marais" also returns the city's big landmarks; if nothing is near, they are better than an empty tab. */
export function nearOnly<T extends { latitude: number; longitude: number }>(places: T[], centre: { lat: number; lng: number } | null, km: number): T[] {
  if (!centre) return places;
  const near = places.filter((p) => distanceKm(p, centre) <= km);
  return near.length > 0 ? near : places;
}

/**
 * Where an area is, from a search for its name: the result that is itself a neighbourhood or district, else the middle of the
 * first few results (the median, so one distant landmark does not drag it).
 */
export function areaCentre(results: Array<{ category: string | null; latitude: number; longitude: number }>): { lat: number; lng: number } | null {
  const named = results.find((r) => /neighbo|sublocality|district|quarter|locality|political|area/i.test(r.category ?? ""));
  if (named) return { lat: named.latitude, lng: named.longitude };
  const top = results.slice(0, 5);
  if (top.length === 0) return null;
  const median = (values: number[]) => { const sorted = [...values].sort((x, y) => x - y); return sorted[Math.floor(sorted.length / 2)]; };
  return { lat: median(top.map((r) => r.latitude)), lng: median(top.map((r) => r.longitude)) };
}

/** A search for an area also returns the area itself ("Le Marais" the neighbourhood); it is the page we are on, not a place to go. */
export function withoutArea<T extends { name: string; category: string | null }>(places: T[], areaName: string): T[] {
  const target = searchName(areaName).toLowerCase();
  return places.filter((p) => p.name.trim().toLowerCase() !== target && !/neighbo|sublocality|district|quarter|political/i.test(p.category ?? ""));
}
