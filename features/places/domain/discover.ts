import type { AiSearchDirective } from "@/lib/application/ai-search";
import type { NearbyEvent } from "@/lib/application/nearby-events";
import type { RankAnchor, RankContext } from "@/lib/application/rank-places";
import { inDestination } from "@/lib/places-ui";
import type { Place } from "@/packages/contracts/place";

export type StayItem = { hotelId: string; name: string; thumbnail: string | null; nightlyAmount: number; currency: string; stars: number | null; rating: number | null };
export type Item =
  | { kind: "place"; place: Place; why?: string | null }
  | { kind: "event"; event: NearbyEvent }
  | { kind: "stay"; stay: StayItem };
export type Band = { key: string | null; label: string; items: Item[] };

/** A list the way preferences store it: an array of strings, or one comma-separated string. */
export const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
  : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

/** A usable number: finite and not zero. */
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null);

// A "guided tours" text search matches loosely — Google mixes in famous landmarks that merely
// mention tours, not the tour operators themselves. Keep only actual tour/travel businesses.
export const isTourOperator = (place: Place) =>
  place.category === "tour_agency" || place.category === "travel_agency" || /\btour(s)?\b/i.test(place.name);

// Same URL + different date is a distinct showtime (recurring events often share one ticket
// page across slots) — include the date so dedup doesn't collapse them into a single listing.
export const idOf = (item: Item) => (item.kind === "place" ? item.place.providerId : item.kind === "event" ? `${item.event.url}|${item.event.date ?? ""}` : item.stay.hotelId);

/** Star rating as a price band 1–4 (0 when unrated), the same bands the stay sub-chips use. */
export const starBand = (stars: number | null) => (!stars ? 0 : stars >= 5 ? 4 : stars >= 4 ? 3 : stars >= 3 ? 2 : 1);

export const toStayItem = (o: Record<string, unknown>): StayItem => ({
  hotelId: String(o.hotelId ?? ""),
  name: String(o.name ?? "Stay"),
  thumbnail: typeof o.thumbnail === "string" ? o.thumbnail : null,
  nightlyAmount: Number(o.nightlyAmount) || 0,
  currency: String(o.currency ?? ""),
  stars: typeof o.stars === "number" ? o.stars : null,
  rating: typeof o.rating === "number" ? o.rating : null,
});

/**
 * Anchor a free-text query to the trip's destination unless it already names a place.
 * `force`: the text is a list of interests ("food, art, jazz"), whose commas are not a place name, so anchor it regardless.
 */
export function scopeQuery(q: string, destination: string, { force = false }: { force?: boolean } = {}): string {
  const clean = q.trim();
  if (!destination) return clean;
  const head = destination.toLowerCase().split(",")[0].trim();
  const namesAPlace = (!force && clean.includes(",")) || clean.toLowerCase().includes(head);
  return namesAPlace ? clean : `${clean} in ${destination}`;
}

/** The interests and likes in a trip's preferences, joined and lower-cased: a stable key for memoising on. */
export const interestsKeyOf = (prefs: Record<string, unknown>): string => [...asList(prefs.interests), ...asList(prefs.likes)].join(",").toLowerCase();

/** The (up to four) distinct interest terms in such a key. */
export const interestTerms = (key: string): string[] => Array.from(new Set(key.split(",").filter(Boolean))).slice(0, 4);

/** What the ranker is told about this traveller. The `*Key` arguments are the comma/pipe-joined primitives the screen memoises on. */
export function rankContext(input: {
  prefs: Record<string, unknown>;
  dislikesKey: string;
  savedKey: string;
  rejectedKey: string;
  /** "lat,lng|lat,lng…" of itinerary stops that have a location. */
  itinKey: string;
  /** "lat,lng" of a confirmed stay, or "". */
  stayKey: string;
  miles: boolean;
}): RankContext {
  const { prefs, dislikesKey, savedKey, rejectedKey, itinKey, stayKey, miles } = input;
  const pts = itinKey.split("|").map((s) => s.split(",")).filter((xy) => xy[0] && xy[1]).map(([a, b]) => ({ latitude: Number(a), longitude: Number(b) }));
  const anchor: RankAnchor | null = pts.length
    ? { latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length, longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length }
    : null;
  const [stayLat, stayLng] = stayKey.split(",");
  const stayAnchor: RankAnchor | null = stayKey ? { latitude: Number(stayLat), longitude: Number(stayLng) } : null;
  return {
    interests: asList(prefs.interests),
    likes: asList(prefs.likes),
    dislikes: dislikesKey.split(",").filter(Boolean),
    savedIds: savedKey.split(",").filter(Boolean),
    rejectedIds: rejectedKey.split(",").filter(Boolean),
    anchor,
    stayAnchor,
    miles,
  };
}

/** The "All" digest: each source's results as a band (empty ones dropped), in the order the page shows them. */
export function digestBands(input: {
  sights: Place[];
  forYou: Place[];
  eat: Place[];
  tours: Place[];
  events: NearbyEvent[];
  stays: StayItem[];
  interests: string[];
  destination: string;
  /** Ranks places for this traveller into items. */
  rank: (places: Place[]) => Item[];
}): Band[] {
  const { sights, forYou, eat, tours, events, stays, interests, destination, rank } = input;
  return [
    { key: "sights", label: "Top sights", items: rank(sights) },
    {
      key: null,
      label: interests.length ? `Because you like ${interests.slice(0, 2).join(" & ")}` : "Highly rated right now",
      items: rank(forYou),
    },
    { key: "eat", label: "Where to eat", items: rank(eat.filter((place) => inDestination(place, destination))) },
    // Real, dynamic tour operators from Google Places — not GetYourGuide's own catalog (no API
    // access there). Opening one still surfaces a "Book on GetYourGuide" link once configured,
    // via PlaceDetailView's GetYourGuideCard.
    { key: "activities", label: "Tours & activities", items: rank(tours.filter(isTourOperator)) },
    { key: "events", label: "On while you’re there", items: events.map((e) => ({ kind: "event", event: e }) as Item) },
    { key: "stays", label: "Places to stay", items: stays.slice(0, 6).map((s) => ({ kind: "stay", stay: s }) as Item) },
  ].filter((b) => b.items.length);
}

/** An events page appended to what is shown, leaving out any event already in the list. */
export function appendEvents(current: Item[], next: NearbyEvent[]): Item[] {
  const have = new Set(current.map(idOf));
  return [...current, ...next.map((event) => ({ kind: "event", event }) as Item).filter((it) => !have.has(idOf(it)))];
}

/** The phone's single feed: up to six of each band, in band order, without the same thing twice. */
export function flatFeed(bands: Band[] | null): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const band of bands ?? []) for (const it of band.items.slice(0, 6)) { const id = idOf(it); if (!seen.has(id)) { seen.add(id); out.push(it); } }
  return out;
}

/** Stays narrowed to the chosen price bands (`bandOf` turns a chip label into its band number); all of them when none is chosen. */
export function staysInBands(all: StayItem[], chosen: string[], bandOf: (label: string) => number): StayItem[] {
  const wanted = chosen.length ? new Set(chosen.map(bandOf)) : null;
  return wanted ? all.filter((s) => wanted.has(starBand(s.stars))) : all;
}

/**
 * A search anchored to the destination ("rooftop bars" became "rooftop bars in Niagara Falls") still comes back with places in Toronto and
 * Buffalo. Keep the ones in the destination; if that leaves nothing, show what came back rather than an empty page.
 */
export function searchResults(found: Place[], anchored: boolean, destination: string): Place[] {
  const here = anchored ? found.filter((place) => inDestination(place, destination)) : found;
  return here.length > 0 ? here : found;
}

/** What an AI-search directive asks the screen to do: open a category (with its sub-chips), or run a free-text search. */
export type DirectiveAction =
  | { kind: "category"; category: string; subs: string[]; label: string }
  | { kind: "search"; query: string; label: string };

const CATEGORY_LABEL: Record<string, string> = { outdoors: "Nature & Outdoors", events: "Culture & Events" };

export function directiveAction(d: AiSearchDirective, raw: string, isCategory: (key: string) => boolean): DirectiveAction {
  const core = (d.freeText ?? raw).trim();
  // A specific ask ("rooftop bars") beats a coarse bucket ("nightlife").
  const genericAsk = !d.freeText || d.freeText.length < 4;
  const cat = (d.categories ?? []).map((k) => k.toLowerCase()).find(isCategory);
  if (cat && genericAsk) return { kind: "category", category: cat, subs: d.subChips ?? [], label: CATEGORY_LABEL[cat] ?? cat };
  return d.location
    ? { kind: "search", query: `${core} near ${d.location}`, label: `${core} · near ${d.location}` }
    : { kind: "search", query: core, label: core };
}
