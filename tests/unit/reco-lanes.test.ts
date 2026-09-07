import { describe, expect, it } from "vitest";
import { classifyPlaceVibe, lanesFor, type Lane, type Vibe } from "@/packages/reco/vibes";

const ALL_VIBES: Vibe[] = [
  "green_space", "live_music", "nightlife", "sacred", "expo",
  "performing_arts", "museum_culture", "beach_water", "sports", "food_scene", "lodging", "default",
];

const resolveQuery = (lane: Lane) =>
  typeof lane.query === "function" ? lane.query({ name: "Anchor", city: "Testville" }) : lane.query;

describe("lane table invariants", () => {
  for (const vibe of ALL_VIBES) {
    const lanes = lanesFor(vibe);

    it(`${vibe}: has at least 3 lanes`, () => {
      expect(lanes.length).toBeGreaterThanOrEqual(3);
    });

    it(`${vibe}: lane ids are unique`, () => {
      expect(new Set(lanes.map((l) => l.id)).size).toBe(lanes.length);
    });

    it(`${vibe}: every lane source is places | events`, () => {
      for (const l of lanes) expect(["places", "events"]).toContain(l.source);
    });

    it(`${vibe}: a places lane always resolves to a non-empty query`, () => {
      for (const l of lanes) {
        if (l.source === "places") expect(resolveQuery(l).trim().length).toBeGreaterThan(0);
      }
    });

    it(`${vibe}: semantic + radiusKm only ever sit on a places lane`, () => {
      for (const l of lanes) {
        if (l.semantic) expect(l.source).toBe("places");
        if (l.radiusKm !== undefined) {
          expect(l.source).toBe("places");
          expect(l.radiusKm).toBeGreaterThan(0);
        }
      }
    });

    it(`${vibe}: at most one semantic ("more like this") lane, and it is first`, () => {
      const semanticIdx = lanes.map((l, i) => (l.semantic ? i : -1)).filter((i) => i >= 0);
      expect(semanticIdx.length).toBeLessThanOrEqual(1);
      if (semanticIdx.length === 1) expect(semanticIdx[0]).toBe(0);
    });

    it(`${vibe}: layout, when set, is strip | peek`, () => {
      for (const l of lanes) if (l.layout) expect(["strip", "peek"]).toContain(l.layout);
    });
  }

  it("every non-default vibe leads with a 'more like this' lane (events or semantic places)", () => {
    for (const vibe of ALL_VIBES) {
      if (vibe === "default") continue;
      const first = lanesFor(vibe)[0];
      expect(first.semantic === true || first.source === "events").toBe(true);
    }
  });
});

describe("lanesFor — facet append", () => {
  it("appends exactly one peek lane for a distinct secondary", () => {
    const base = lanesFor("green_space").length;
    const withFacet = lanesFor("green_space", "live_music");
    expect(withFacet.length).toBe(base + 1);
    const extra = withFacet.at(-1)!;
    expect(extra.id).toBe("facet-live_music-concerts");
    expect(extra.layout).toBe("peek");
    expect(extra.source).toBe("events");
  });

  it("does not append for same / undefined / default secondary", () => {
    const base = lanesFor("sports").length;
    expect(lanesFor("sports", "sports")).toHaveLength(base);
    expect(lanesFor("sports", undefined)).toHaveLength(base);
    expect(lanesFor("sports", "default")).toHaveLength(base);
  });

  it("the appended facet lane never collides with a primary lane id", () => {
    for (const primary of ALL_VIBES) {
      for (const secondary of ALL_VIBES) {
        const lanes = lanesFor(primary, secondary);
        expect(new Set(lanes.map((l) => l.id)).size).toBe(lanes.length);
      }
    }
  });

  it("mutating the returned array does not corrupt the table", () => {
    const a = lanesFor("nightlife");
    a.pop();
    expect(lanesFor("nightlife").length).toBeGreaterThan(a.length);
  });
});

// ── The six situations from the product brief ────────────────────────────────
describe("product scenarios → lane order", () => {
  const laneIds = (v: Vibe, s?: Vibe) => lanesFor(v, s).map((l) => l.id);
  const vibeOf = (p: Parameters<typeof classifyPlaceVibe>[0]) => classifyPlaceVibe(p);

  it("garden: more gardens first, then events-here, then around, then food — no expo/concert section", () => {
    const { vibe, secondary } = vibeOf({ primaryType: "botanical_garden", name: "Kirstenbosch" });
    expect(vibe).toBe("green_space");
    expect(laneIds(vibe, secondary)).toEqual(["gardens", "here-events", "around", "food"]);
  });

  it("concert (event): concerts, then other events, then things-to-do, then eat — no gardens section", () => {
    const vibe = "live_music" as const;
    expect(laneIds(vibe)).toEqual(["concerts", "other-events", "do", "eat"]);
    expect(laneIds(vibe)).not.toContain("gardens");
  });

  it("tech expo (event): expos, talks, food — no concert or garden lane", () => {
    const vibe = "expo" as const;
    expect(laneIds(vibe)).toEqual(["shows", "talks", "food"]);
  });

  it("religious place: more sacred, heritage, gardens, tea — no expo/concert lane", () => {
    const { vibe } = vibeOf({ primaryType: "hindu_temple", name: "Meenakshi Temple" });
    expect(vibe).toBe("sacred");
    const ids = laneIds(vibe);
    expect(ids).toEqual(["more", "heritage", "calm", "tea"]);
    expect(ids.some((i) => i.includes("expo") || i.includes("concert"))).toBe(false);
  });

  it("club: more clubs, bars, live & comedy, late-night food", () => {
    const { vibe } = vibeOf({ primaryType: "night_club", name: "Fabric" });
    expect(vibe).toBe("nightlife");
    expect(laneIds(vibe)).toEqual(["clubs", "bars", "live", "latenight"]);
  });

  it("beach: on-the-water events, beach bars, activities, more beaches — no sacred lane", () => {
    const { vibe } = vibeOf({ primaryType: "beach", name: "Copacabana Beach" });
    expect(vibe).toBe("beach_water");
    const ids = laneIds(vibe);
    expect(ids).toEqual(["events", "bars", "activities", "more"]);
    expect(ids).not.toContain("more-sacred");
  });
});

// ── "in real life": a realistic anchor of each vibe → correct lane set, wrong lanes absent ──
describe("real-world anchors → right suggestions", () => {
  const wrongTitle: Record<string, RegExp> = {
    green_space: /concert|expo|nightclub/i,
    live_music: /garden|temple|beach/i,
    nightlife: /garden|museum|temple/i,
    sacred: /concert|expo|nightclub|tech/i,
    expo: /garden|concert|beach/i,
    performing_arts: /garden|beach|nightclub/i,
    museum_culture: /nightclub|concert/i,
    beach_water: /temple|museum|expo/i,
    sports: /garden|temple/i,
    food_scene: /temple|expo/i,
  };

  const ANCHORS: Array<{ label: string; anchor: Parameters<typeof classifyPlaceVibe>[0]; vibe: Vibe }> = [
    { label: "Kew Gardens", anchor: { primaryType: "botanical_garden", name: "Royal Botanic Gardens, Kew" }, vibe: "green_space" },
    { label: "Yellowstone", anchor: { primaryType: "national_park", name: "Yellowstone National Park" }, vibe: "green_space" },
    { label: "Red Rocks", anchor: { primaryType: "amphitheatre", name: "Red Rocks Amphitheatre" }, vibe: "live_music" },
    { label: "Royal Albert Hall", anchor: { primaryType: "concert_hall", name: "Royal Albert Hall" }, vibe: "live_music" },
    { label: "Berghain", anchor: { primaryType: "night_club", name: "Berghain" }, vibe: "nightlife" },
    { label: "a wine bar", anchor: { primaryType: "wine_bar", name: "La Cave" }, vibe: "nightlife" },
    { label: "Notre-Dame", anchor: { primaryType: "church", name: "Cathédrale Notre-Dame de Paris" }, vibe: "sacred" },
    { label: "Golden Temple", anchor: { primaryType: "place_of_worship", name: "Harmandir Sahib" }, vibe: "sacred" },
    { label: "a convention centre", anchor: { primaryType: "convention_center", name: "Javits Center" }, vibe: "expo" },
    { label: "Globe Theatre", anchor: { primaryType: "performing_arts_theater", name: "Shakespeare's Globe" }, vibe: "performing_arts" },
    { label: "the Met", anchor: { primaryType: "museum", name: "The Metropolitan Museum of Art" }, vibe: "museum_culture" },
    { label: "Tate Modern", anchor: { primaryType: "art_gallery", name: "Tate Modern" }, vibe: "museum_culture" },
    { label: "Bondi Beach", anchor: { primaryType: "beach", name: "Bondi Beach" }, vibe: "beach_water" },
    { label: "a marina", anchor: { primaryType: "marina", name: "Marina Bay" }, vibe: "beach_water" },
    { label: "Wembley", anchor: { primaryType: "stadium", name: "Wembley Stadium" }, vibe: "sports" },
    { label: "Pebble Beach GC", anchor: { primaryType: "golf_course", name: "Pebble Beach Golf Links" }, vibe: "sports" },
    { label: "Borough Market", anchor: { primaryType: "market", name: "Borough Market" }, vibe: "food_scene" },
    { label: "a bakery", anchor: { primaryType: "bakery", name: "Poilâne" }, vibe: "food_scene" },
    { label: "generic office tower", anchor: { primaryType: "point_of_interest", name: "One Liberty Plaza" }, vibe: "default" },
  ];

  for (const { label, anchor, vibe } of ANCHORS) {
    it(`${label} → ${vibe}: leads correctly and shows no off-vibe section`, () => {
      const r = classifyPlaceVibe(anchor);
      expect(r.vibe).toBe(vibe);
      const lanes = lanesFor(r.vibe, r.secondary);
      expect(lanes.length).toBeGreaterThanOrEqual(3);
      if (vibe !== "default") {
        expect(lanes[0].semantic === true || lanes[0].source === "events").toBe(true);
        const wrong = wrongTitle[vibe];
        for (const l of lanes) expect(l.title).not.toMatch(wrong);
      }
    });
  }
});
