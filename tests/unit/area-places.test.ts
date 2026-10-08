import { describe, expect, it } from "vitest";
import { areaCentre, centroid, distanceKm, feelTags, nearOnly, placeTabs, ringPoints, searchName, withoutArea } from "../../features/conversation/domain/areaPlaces";

describe("placeTabs", () => {
  it("opens with Top picks, then one tab per tag that names something to look up", () => {
    const tabs = placeTabs(["shopping", "bistros", "walkable", "nightlife"], "area");
    expect(tabs.map((t) => t.label)).toEqual(["Top picks", "Shopping", "Bistros", "Nightlife"]);
    expect(tabs[2].query).toBe("restaurants and bistros");
  });
  it("does not make a tab of a quality like walkable, central or hilly", () => {
    expect(placeTabs(["walkable", "central", "hilly"], "area").map((t) => t.label)).toEqual(["Top picks", "Eat & drink", "Sights"]);
  });
  it("makes one tab when two tags are the same kind of search", () => {
    expect(placeTabs(["cafes", "coffee"], "area").map((t) => t.label)).toEqual(["Top picks", "Cafes"]);
  });
  it("searches for things to see on a day trip", () => {
    expect(placeTabs([], "daytrip")[0].query).toContain("see");
  });
  it("never offers more than six tabs", () => {
    expect(placeTabs(["shopping", "bistros", "cafes", "nightlife", "museums", "parks", "views"], "area")).toHaveLength(6);
  });
});

describe("feelTags", () => {
  it("keeps what describes the area and drops what became a tab", () => {
    expect(feelTags(["shopping", "walkable", "nightlife", "hilly"])).toEqual(["walkable", "hilly"]);
  });
});

describe("map helpers", () => {
  it("centres on the middle of the places", () => {
    expect(centroid([{ latitude: 48, longitude: 2 }, { latitude: 50, longitude: 4 }])).toEqual({ lat: 49, lng: 3 });
    expect(centroid([])).toBeNull();
  });
  it("draws a closed ring about the right size", () => {
    const ring = ringPoints(48.86, 2.36, 500);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const [lng, lat] = ring[12]; // a quarter of the way round: due north
    expect(lat).toBeGreaterThan(48.86);
    expect(Math.abs(lng - 2.36)).toBeLessThan(0.001);
    expect((lat - 48.86) * 111_320).toBeGreaterThan(480);
    expect((lat - 48.86) * 111_320).toBeLessThan(520);
  });
  it("searches by the neighbourhood name, not the arrondissement note", () => {
    expect(searchName("Le Marais (3rd/4th)")).toBe("Le Marais");
    expect(searchName("Montmartre (18th)")).toBe("Montmartre");
    expect(searchName("Versailles")).toBe("Versailles");
  });
});

describe("placing an area", () => {
  const marais = { lat: 48.857, lng: 2.36 };
  const vosges = { latitude: 48.8555, longitude: 2.3656, category: "park" };
  const luxembourg = { latitude: 48.8462, longitude: 2.3372, category: "garden" };
  it("measures distance in kilometres", () => {
    expect(distanceKm(vosges, marais)).toBeLessThan(0.5);
    expect(distanceKm(luxembourg, marais)).toBeGreaterThan(2);
  });
  it("keeps what is near the area, and falls back to everything when nothing is", () => {
    expect(nearOnly([vosges, luxembourg], marais, 1.6)).toEqual([vosges]);
    expect(nearOnly([luxembourg], marais, 1.6)).toEqual([luxembourg]);
    expect(nearOnly([vosges, luxembourg], null, 1.6)).toHaveLength(2);
  });
  it("takes the neighbourhood result as the centre when there is one", () => {
    expect(areaCentre([{ category: "restaurant", latitude: 1, longitude: 1 }, { category: "neighborhood", latitude: 48.86, longitude: 2.36 }])).toEqual({ lat: 48.86, lng: 2.36 });
  });
  it("otherwise uses the middle of the first results, so one far landmark does not drag it", () => {
    const centre = areaCentre([vosges, { ...vosges, latitude: 48.857, longitude: 2.361 }, { ...vosges, latitude: 48.858, longitude: 2.359 }, luxembourg, { ...luxembourg, latitude: 48.82 }]);
    expect(Math.abs(centre!.lat - 48.857)).toBeLessThan(0.003);
    expect(areaCentre([])).toBeNull();
  });
});

describe("withoutArea", () => {
  it("drops the area itself from its own list of places", () => {
    const list = [{ name: "Le Marais", category: "neighborhood" }, { name: "Place des Vosges", category: "park" }, { name: "Marais Café", category: "cafe" }];
    expect(withoutArea(list, "Le Marais (3rd/4th)").map((p) => p.name)).toEqual(["Place des Vosges", "Marais Café"]);
  });
});
