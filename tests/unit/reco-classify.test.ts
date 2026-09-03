import { describe, expect, it } from "vitest";
import { classifyEventVibe, classifyPlaceVibe, lanesFor, type Vibe } from "@/packages/reco/vibes";

// ── classifyPlaceVibe: every TYPE_MAP entry resolves to its vibe ───────────────
const TYPE_EXPECT: Record<string, Vibe> = {
  park: "green_space", national_park: "green_space", state_park: "green_space", garden: "green_space",
  botanical_garden: "green_space", hiking_area: "green_space", dog_park: "green_space",
  wildlife_park: "green_space", wildlife_refuge: "green_space",
  concert_hall: "live_music", amphitheatre: "live_music",
  night_club: "nightlife", bar: "nightlife", pub: "nightlife", wine_bar: "nightlife",
  church: "sacred", hindu_temple: "sacred", mosque: "sacred", synagogue: "sacred", place_of_worship: "sacred",
  convention_center: "expo", event_venue: "expo",
  performing_arts_theater: "performing_arts", opera_house: "performing_arts",
  museum: "museum_culture", art_gallery: "museum_culture", cultural_center: "museum_culture",
  historical_landmark: "museum_culture", historical_place: "museum_culture", monument: "museum_culture",
  beach: "beach_water", marina: "beach_water",
  stadium: "sports", arena: "sports", sports_complex: "sports", sports_activity_location: "sports",
  golf_course: "sports", ski_resort: "sports",
  restaurant: "food_scene", cafe: "food_scene", bakery: "food_scene", food_court: "food_scene",
  market: "food_scene", farmers_market: "food_scene",
};

describe("classifyPlaceVibe — TYPE_MAP", () => {
  for (const [type, vibe] of Object.entries(TYPE_EXPECT)) {
    it(`primaryType "${type}" → ${vibe}`, () => {
      expect(classifyPlaceVibe({ primaryType: type }).vibe).toBe(vibe);
    });
  }

  it("uses a types[] entry when primaryType is unmapped", () => {
    expect(classifyPlaceVibe({ primaryType: "tourist_attraction", types: ["x", "mosque"] }).vibe).toBe("sacred");
  });

  it("primaryType wins over a conflicting types[] entry", () => {
    expect(classifyPlaceVibe({ primaryType: "museum", types: ["night_club"] }).vibe).toBe("museum_culture");
  });

  it("first mapped types[] entry wins", () => {
    expect(classifyPlaceVibe({ types: ["park", "restaurant"] }).vibe).toBe("green_space");
  });
});

describe("classifyPlaceVibe — keyword fallback", () => {
  const KW: Array<[string, Vibe]> = [
    ["Kew Botanic Gardens", "green_space"],
    ["Regent's Park", "green_space"],
    ["Riverside Nature Reserve", "green_space"],
    ["The O2 Arena", "live_music"],
    ["Berlin Philharmonie", "live_music"],
    ["Ministry of Sound nightclub", "nightlife"],
    ["Sky Lounge cocktail bar", "nightlife"],
    ["St Paul's Cathedral", "sacred"],
    ["Golden Temple", "sacred"],
    ["ExCeL Exhibition Centre", "expo"],
    ["Web Summit conference", "expo"],
    ["Old Vic Theatre", "performing_arts"],
    ["Comedy Store", "performing_arts"],
    ["Natural History Museum", "museum_culture"],
    ["Vietnam War Memorial", "museum_culture"],
    ["Brighton Pier", "beach_water"],
    ["Camps Bay seafront promenade", "beach_water"],
    ["Wembley Stadium", "sports"],
    ["Lord's Cricket Ground", "sports"],
    ["Grand Bazaar", "food_scene"],
    ["Smorgasburg food hall", "food_scene"],
  ];
  for (const [name, vibe] of KW) {
    it(`"${name}" → ${vibe}`, () => {
      expect(classifyPlaceVibe({ primaryType: "point_of_interest", name }).vibe).toBe(vibe);
    });
  }
});

describe("classifyPlaceVibe — default & edges", () => {
  it("generic type + featureless name → default", () => {
    expect(classifyPlaceVibe({ primaryType: "point_of_interest", name: "Acme Holdings LLC" }).vibe).toBe("default");
  });
  it("no inputs at all → default", () => {
    expect(classifyPlaceVibe({}).vibe).toBe("default");
  });
  it("null / undefined fields are tolerated", () => {
    expect(classifyPlaceVibe({ primaryType: null, types: null, name: undefined }).vibe).toBe("default");
  });
  it("empty strings are tolerated", () => {
    expect(classifyPlaceVibe({ primaryType: "", types: [], name: "" }).vibe).toBe("default");
  });
  it("classification is case-sensitive on Google types (they are always lower-snake)", () => {
    expect(classifyPlaceVibe({ primaryType: "MUSEUM" }).vibe).toBe("default");
  });
});

describe("classifyPlaceVibe — no keyword-derived secondary", () => {
  // The sync classifier never emits a secondary; only the embedding fallback does.
  it("a type-mapped place with a cross-vibe keyword in its name has no secondary", () => {
    expect(classifyPlaceVibe({ primaryType: "stadium", name: "Wembley Stadium — Coldplay concert" }).secondary).toBeUndefined();
  });
  it("'Signal Iduna Park' (a stadium) does not pick up a green_space facet", () => {
    expect(classifyPlaceVibe({ primaryType: "stadium", name: "Signal Iduna Park" })).toEqual({ vibe: "sports" });
  });
  it("a keyword-classified place has no secondary", () => {
    expect(classifyPlaceVibe({ primaryType: "point_of_interest", name: "Riverside Botanic Gardens" }).secondary).toBeUndefined();
  });
});

// ── classifyEventVibe ────────────────────────────────────────────────────────
describe("classifyEventVibe", () => {
  it("PredictHQ category takes precedence over TM segment", () => {
    expect(classifyEventVibe({ predicthqCategory: "expos", tmSegment: "Music" })).toBe("expo");
  });
  for (const [cat, vibe] of Object.entries({
    concerts: "live_music", festivals: "live_music", "performing-arts": "performing_arts",
    sports: "sports", community: "default", expos: "expo", conferences: "expo",
  })) {
    it(`predicthqCategory "${cat}" → ${vibe}`, () => {
      expect(classifyEventVibe({ predicthqCategory: cat })).toBe(vibe as Vibe);
    });
  }
  for (const [seg, vibe] of Object.entries({
    Music: "live_music", "Arts & Theatre": "performing_arts", Sports: "sports",
    Film: "performing_arts", Miscellaneous: "default",
  })) {
    it(`tmSegment "${seg}" → ${vibe}`, () => {
      expect(classifyEventVibe({ tmSegment: seg })).toBe(vibe as Vibe);
    });
  }
  it("falls back to a title keyword scan", () => {
    expect(classifyEventVibe({ title: "Late Night Comedy Gala" })).toBe("performing_arts");
  });
  it("scans the venue when the title has no signal", () => {
    expect(classifyEventVibe({ title: "Season Opener", venue: "Emirates Stadium" })).toBe("sports");
  });
  it("unknown segment falls through to keywords, then default", () => {
    expect(classifyEventVibe({ tmSegment: "Undefined", title: "misc gathering" })).toBe("default");
  });
  it("empty / null everything → default", () => {
    expect(classifyEventVibe({})).toBe("default");
    expect(classifyEventVibe({ predicthqCategory: null, tmSegment: null, title: undefined })).toBe("default");
  });
});
