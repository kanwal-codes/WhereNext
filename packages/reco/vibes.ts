/**
 * Situational recommendation lanes for a detail page.
 *
 * The anchor (the place or event on screen) is classified into one "vibe", and each
 * vibe declares an ordered list of lanes — the sections that appear, and in what
 * order. A lane the vibe doesn't list never shows: that's the whole negative-rule
 * system ("no tech expos under a garden"). No AI here — a type map with a keyword
 * fallback. Phase 2 adds embedding similarity for the tail of generic Google types.
 */

export type Vibe =
  | "green_space"
  | "live_music"
  | "nightlife"
  | "sacred"
  | "expo"
  | "performing_arts"
  | "museum_culture"
  | "beach_water"
  | "sports"
  | "food_scene"
  | "default";

export type LaneAnchor = { name: string; city: string; lat?: number; lng?: number; genre?: string | null };

export type Lane = {
  id: string;
  title: string;
  source: "places" | "events";
  /** Text query, or one built from the anchor (e.g. events *at this venue*). */
  query: string | ((a: LaneAnchor) => string);
  /** "peek" caps the lane at a single card — a taste, not a section. */
  layout?: "strip" | "peek";
  /** When set, results are filtered to within this straight-line distance of the anchor. */
  radiusKm?: number;
  /** "more like this one" lane — worth an embedding-similarity re-rank against the anchor. */
  semantic?: boolean;
};

// ── Classification ────────────────────────────────────────────────────────────

/** Google Places (New) `primaryType` / `types[]` → vibe. Common values only; the
 *  long tail falls through to the keyword scan, then to "default". */
const TYPE_MAP: Record<string, Vibe> = {
  park: "green_space", national_park: "green_space", state_park: "green_space",
  garden: "green_space", botanical_garden: "green_space", hiking_area: "green_space",
  dog_park: "green_space", wildlife_park: "green_space", wildlife_refuge: "green_space",

  concert_hall: "live_music", amphitheatre: "live_music",

  night_club: "nightlife", bar: "nightlife", pub: "nightlife", wine_bar: "nightlife",

  church: "sacred", hindu_temple: "sacred", mosque: "sacred", synagogue: "sacred",
  place_of_worship: "sacred",

  convention_center: "expo", event_venue: "expo",

  performing_arts_theater: "performing_arts", opera_house: "performing_arts",

  museum: "museum_culture", art_gallery: "museum_culture", cultural_center: "museum_culture",
  historical_landmark: "museum_culture", historical_place: "museum_culture", monument: "museum_culture",

  beach: "beach_water", marina: "beach_water",

  stadium: "sports", arena: "sports", sports_complex: "sports",
  sports_activity_location: "sports", golf_course: "sports", ski_resort: "sports",

  restaurant: "food_scene", cafe: "food_scene", bakery: "food_scene",
  food_court: "food_scene", market: "food_scene", farmers_market: "food_scene",
};

// Stems use a trailing `\w*` so inflected forms match ("botanic" → botanical, "amphitheat"
// → amphitheatre, "philharmon" → philharmonie). A bare `\bstem\b` would match only the exact
// stem as a whole word, which is almost never what appears in a real venue name.
const KEYWORDS: Array<[RegExp, Vibe]> = [
  [/\b(garden|arboret\w*|botanic\w*|conservatory|greenhouse)\b/, "green_space"],
  [/\b(park|parkland|nature reserve|nature park|trail|trailhead|meadow|woodland|greenway)\b/, "green_space"],
  [/\b(concert|arena|amphitheat\w*|philharmon\w*|symphony|live music|gig venue)\b/, "live_music"],
  [/\b(night\s*club|nightlife|lounge|cocktail|speakeasy|discoth\w*|pub|tavern|taproom|alehouse)\b/, "nightlife"],
  [/\b(temple|church|mosque|gurdwara|synagogue|shrine|basilica|cathedral|monaster\w*|pilgrim\w*)\b/, "sacred"],
  [/\b(expo|convention|trade show|conference|exhibition cent(re|er)|fairground)\b/, "expo"],
  [/\b(theatre|theater|comedy|playhouse|opera|ballet|cabaret|drama)\b/, "performing_arts"],
  [/\b(museum|gallery|memorial|monument|heritage|historic\w*|exhibit\w*|planetarium)\b/, "museum_culture"],
  [/\b(beach|pier|waterfront|lagoon|cove|marina|boardwalk|seafront|promenade)\b/, "beach_water"],
  [/\b(stadium|sports|golf|ski|skate|racecourse|racetrack|cricket|aquatic cent(re|er))\b/, "sports"],
  [/\b(market|food hall|night market|bazaar|brewery|winery|distillery|food court)\b/, "food_scene"],
];

/**
 * Common "<x> park" phrases that are not green space. Checked only when the sole reason for
 * a green_space match would be the bare word "park" — a plain string test, no lookbehind, so
 * it is safe in every browser (`vibes.ts` runs client-side).
 */
const PARK_FALSE_FRIEND = /\b(car|business|retail|office|trailer|industrial|tech|science|trading|caravan|amusement|theme|water|ball) ?park/;

const REAL_GREEN = /\b(garden|arboret|botanic|conservatory|greenhouse|nature reserve|woodland|meadow|greenway|trail)\b/;

function keywordVibe(text: string): Vibe | null {
  const t = text.toLowerCase();
  const skipParkMatch = PARK_FALSE_FRIEND.test(t) && !REAL_GREEN.test(t);
  for (const [re, vibe] of KEYWORDS) {
    if (!re.test(t)) continue;
    // "business park" / "car park" with no other green signal → keep scanning, don't call it green_space.
    if (vibe === "green_space" && skipParkMatch) continue;
    return vibe;
  }
  return null;
}

/** Ticketmaster `segment` (first token of its `genre` string) → vibe. */
const TM_SEGMENT_MAP: Record<string, Vibe> = {
  Music: "live_music",
  "Arts & Theatre": "performing_arts",
  Sports: "sports",
  Film: "performing_arts",
  Miscellaneous: "default",
};

/** PredictHQ `category` → vibe. Optional provider; this map is only consulted when
 *  a PredictHQ-sourced event carries a category. */
const PREDICTHQ_CATEGORY_MAP: Record<string, Vibe> = {
  concerts: "live_music",
  festivals: "live_music",
  "performing-arts": "performing_arts",
  sports: "sports",
  community: "default",
  expos: "expo",
  conferences: "expo",
};

/**
 * Sync vibe for a place: the Google type map first, then a keyword scan of the name, then
 * "default". No `secondary` here — a keyword hit is a single weak signal and pairing it as
 * a facet produced false positives ("Signal Iduna Park" → a gardens lane on a stadium). The
 * embedding classifier (`classifyByEmbedding`, used when this returns "default") is the only
 * place a secondary facet comes from, since it has a real similarity runner-up.
 */
export function classifyPlaceVibe(anchor: {
  primaryType?: string | null;
  types?: string[] | null;
  name?: string;
}): { vibe: Vibe; secondary?: Vibe } {
  const primaryType = typeof anchor.primaryType === "string" ? anchor.primaryType : "";
  const types = (Array.isArray(anchor.types) ? anchor.types : []).filter((t): t is string => typeof t === "string");
  const name = typeof anchor.name === "string" ? anchor.name : "";

  const byType = (primaryType && TYPE_MAP[primaryType]) || types.map((t) => TYPE_MAP[t]).find(Boolean) || null;
  if (byType) return { vibe: byType };
  return { vibe: keywordVibe(`${name} ${types.join(" ")}`) ?? "default" };
}

export function classifyEventVibe(event: {
  predicthqCategory?: string | null;
  tmSegment?: string | null;
  title?: string;
  venue?: string;
}): Vibe {
  const phq = typeof event.predicthqCategory === "string" ? PREDICTHQ_CATEGORY_MAP[event.predicthqCategory] : undefined;
  const tm = typeof event.tmSegment === "string" ? TM_SEGMENT_MAP[event.tmSegment] : undefined;
  const title = typeof event.title === "string" ? event.title : "";
  const venue = typeof event.venue === "string" ? event.venue : "";
  return phq || tm || keywordVibe(`${title} ${venue}`) || "default";
}

/** Vibes where being outdoors / exposed to weather is inherent to the visit. */
const WEATHER_SENSITIVE_VIBES = new Set<Vibe>(["beach_water", "green_space", "sports"]);
/** Outdoor Google types whose vibe might land on "default" but where weather still matters. */
const WEATHER_SENSITIVE_TYPES = new Set([
  "campground", "rv_park", "water_park", "amusement_park", "zoo", "safari_park",
  "off_roading_area", "adventure_sports_center", "cycling_park",
  "observation_deck", "scenic_point", "plaza", "boat_tour", "sightseeing_tour",
  "fishing_charter", "fishing_pond", "hiking_area", "picnic_ground",
]);

/**
 * Should a place's detail page show the trip-weather line? Only when the visit is
 * weather-exposed — a park, beach, hike, ski hill, stadium, viewpoint, boat tour. An
 * ice-cream shop, museum, restaurant, bar or theatre gets nothing: the forecast there is
 * noise, and "it's raining, I'll skip it" is a decision the traveller makes without a widget.
 */
export function isWeatherRelevantPlace(anchor: { primaryType?: string | null; types?: string[] | null }): boolean {
  if (WEATHER_SENSITIVE_VIBES.has(classifyPlaceVibe(anchor).vibe)) return true;
  const primaryType = typeof anchor.primaryType === "string" ? anchor.primaryType : "";
  const types = Array.isArray(anchor.types) ? anchor.types : [];
  return [primaryType, ...types].some((t) => typeof t === "string" && WEATHER_SENSITIVE_TYPES.has(t));
}

// ── Lane table ────────────────────────────────────────────────────────────────

const LANES: Record<Vibe, Lane[]> = {
  green_space: [
    { id: "gardens", title: "More gardens & parks", source: "places", query: "gardens and parks", semantic: true },
    { id: "here-events", title: "Events happening here", source: "events", query: (a) => a.name, layout: "peek" },
    { id: "around", title: "Right around here", source: "places", query: "cafe viewpoint shop landmark", radiusKm: 1 },
    { id: "food", title: "Coffee & food nearby", source: "places", query: "cafe or restaurant" },
  ],
  live_music: [
    { id: "concerts", title: "More concerts", source: "events", query: "concert" },
    { id: "other-events", title: "Other things on nearby", source: "events", query: "" },
    { id: "do", title: "Things to do around here", source: "places", query: "things to do", radiusKm: 2 },
    { id: "eat", title: "Eat before or after", source: "places", query: "restaurant or bar" },
  ],
  nightlife: [
    { id: "clubs", title: "More clubs", source: "places", query: "nightclub", semantic: true },
    { id: "bars", title: "Bars & lounges nearby", source: "places", query: "cocktail bar or lounge", radiusKm: 2 },
    { id: "live", title: "Live & comedy tonight", source: "events", query: "comedy or music" },
    { id: "latenight", title: "Late-night food", source: "places", query: "late night food", layout: "peek" },
  ],
  sacred: [
    { id: "more", title: "More sacred & spiritual places", source: "places", query: "temple church mosque shrine", semantic: true },
    { id: "heritage", title: "Museums & heritage nearby", source: "places", query: "museum or historical landmark" },
    { id: "calm", title: "Gardens & quiet spots", source: "places", query: "garden or park" },
    { id: "tea", title: "Somewhere quiet for tea", source: "places", query: "quiet cafe or tea house", layout: "peek" },
  ],
  expo: [
    { id: "shows", title: "More shows & expos", source: "events", query: "expo or convention" },
    { id: "talks", title: "Talks & meetups nearby", source: "events", query: "" },
    { id: "food", title: "Food near the venue", source: "places", query: "restaurant or cafe", radiusKm: 2 },
  ],
  performing_arts: [
    { id: "shows", title: "More shows", source: "events", query: "theatre or comedy" },
    { id: "music", title: "Concerts & live music", source: "events", query: "concert" },
    { id: "dinner", title: "Dinner before the show", source: "places", query: "restaurant", radiusKm: 2 },
    { id: "culture", title: "Museums & galleries", source: "places", query: "museum or gallery", layout: "peek" },
  ],
  museum_culture: [
    { id: "more", title: "More museums & galleries", source: "places", query: "museum or art gallery", semantic: true },
    { id: "historic", title: "Historic sites nearby", source: "places", query: "historical landmark or monument", radiusKm: 3 },
    { id: "exhib", title: "Exhibitions & talks", source: "events", query: "art or exhibition" },
    { id: "cafe", title: "Cafés nearby", source: "places", query: "cafe", layout: "peek" },
  ],
  beach_water: [
    { id: "events", title: "On & near the water", source: "events", query: "" },
    { id: "bars", title: "Beach bars & cafés", source: "places", query: "beach bar or cafe", radiusKm: 3 },
    { id: "activities", title: "Water activities & rentals", source: "places", query: "water sports or boat rental" },
    { id: "more", title: "More beaches & coast", source: "places", query: "beach" },
  ],
  sports: [
    { id: "games", title: "More matches & games", source: "events", query: "sports" },
    { id: "bars", title: "Sports bars nearby", source: "places", query: "sports bar", radiusKm: 2 },
    { id: "other", title: "Other events nearby", source: "events", query: "", layout: "peek" },
    { id: "food", title: "Food near the venue", source: "places", query: "restaurant", radiusKm: 2 },
  ],
  food_scene: [
    { id: "markets", title: "Markets & food halls", source: "places", query: "food market or food hall", semantic: true },
    { id: "restaurants", title: "Notable restaurants nearby", source: "places", query: "restaurant", radiusKm: 2 },
    { id: "bars", title: "Bars & cafés", source: "places", query: "bar or cafe", radiusKm: 2 },
    { id: "events", title: "What's on nearby", source: "events", query: "", layout: "peek" },
  ],
  default: [
    { id: "stay", title: "Where to stay nearby", source: "places", query: "hotels" },
    { id: "eat", title: "Eat nearby", source: "places", query: "restaurants" },
    { id: "do", title: "Things to do nearby", source: "places", query: "things to do" },
    { id: "events", title: "What's on nearby", source: "events", query: "" },
  ],
};

const laneSet = (vibe: string): Lane[] | null => (Object.hasOwn(LANES, vibe) ? LANES[vibe as Vibe] : null);

/** The ordered lanes for a vibe. A distinct secondary facet contributes one peek lane.
 *  Unknown vibe strings — including "__proto__" / "constructor" — fall back to the
 *  `default` set rather than throwing or reaching an inherited property. */
export function lanesFor(vibe: Vibe, secondary?: Vibe): Lane[] {
  const lanes = [...(laneSet(vibe) ?? LANES.default)];
  const facetSet = secondary && secondary !== vibe && secondary !== "default" ? laneSet(secondary) : null;
  const head = facetSet?.[0];
  if (head) lanes.push({ ...head, id: `facet-${secondary}-${head.id}`, layout: "peek" });
  return lanes;
}
