import { describe, expect, it } from "vitest";
import { classifyEventVibe, classifyPlaceVibe, lanesFor } from "@/packages/reco/vibes";

describe("classifyPlaceVibe", () => {
  it("maps a known Google primaryType", () => {
    expect(classifyPlaceVibe({ primaryType: "botanical_garden" }).vibe).toBe("green_space");
  });

  it("falls back to a types[] entry when primaryType is unmapped", () => {
    expect(classifyPlaceVibe({ primaryType: "tourist_attraction", types: ["mosque", "point_of_interest"] }).vibe).toBe("sacred");
  });

  it("falls back to the name keyword scan for a generic type", () => {
    expect(classifyPlaceVibe({ primaryType: "point_of_interest", name: "Riverside Botanical Conservatory" }).vibe).toBe("green_space");
  });

  it("is 'default' when nothing matches", () => {
    expect(classifyPlaceVibe({ primaryType: "establishment", name: "Acme Corp" }).vibe).toBe("default");
  });

  it("does not derive a secondary facet from the keyword scan (embedding classifier only)", () => {
    const r = classifyPlaceVibe({ primaryType: "garden", name: "Butchart Gardens Summer Concert Lawn" });
    expect(r.vibe).toBe("green_space");
    expect(r.secondary).toBeUndefined();
  });
});

describe("classifyEventVibe", () => {
  it("prefers the PredictHQ category", () => {
    expect(classifyEventVibe({ predicthqCategory: "expos", tmSegment: "Music" })).toBe("expo");
  });

  it("falls back to the Ticketmaster segment", () => {
    expect(classifyEventVibe({ tmSegment: "Arts & Theatre" })).toBe("performing_arts");
  });

  it("falls back to the title keyword scan", () => {
    expect(classifyEventVibe({ title: "Downtown Jazz Concert" })).toBe("live_music");
  });
});

describe("lanesFor", () => {
  it("returns the vibe's lanes in order", () => {
    const ids = lanesFor("green_space").map((l) => l.id);
    expect(ids[0]).toBe("gardens");
    expect(ids).toContain("food");
  });

  it("appends one peek lane for a distinct secondary facet", () => {
    const lanes = lanesFor("green_space", "live_music");
    const extra = lanes.at(-1)!;
    expect(extra.id).toMatch(/^facet-live_music/);
    expect(extra.layout).toBe("peek");
    expect(lanes.filter((l) => l.id.startsWith("facet-"))).toHaveLength(1);
  });

  it("does not append for a same or default secondary", () => {
    expect(lanesFor("green_space", "green_space")).toHaveLength(lanesFor("green_space").length);
    expect(lanesFor("green_space", "default")).toHaveLength(lanesFor("green_space").length);
  });
});
