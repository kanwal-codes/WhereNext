import { describe, expect, it } from "vitest";
import { cityScale, coverText, firstSavedPhotoByTrip, stampParts } from "../../lib/trip-cover";

describe("coverText", () => {
  it("splits a destination into city and country", () => {
    expect(coverText({ name: "Long weekend", destination: "Lisbon, Portugal" })).toEqual({ city: "Lisbon", country: "Portugal" });
    expect(coverText({ name: "x", destination: "Amalfi Coast, Salerno, Italy" })).toEqual({ city: "Amalfi Coast", country: "Italy" });
  });

  it("uses a lone place as the city with no country", () => {
    expect(coverText({ name: "x", destination: "Iceland" })).toEqual({ city: "Iceland", country: "" });
  });

  it("falls back to the trip name when there is no destination", () => {
    expect(coverText({ name: "Somewhere warm", destination: null })).toEqual({ city: "Somewhere warm", country: "" });
    expect(coverText({ name: "Somewhere warm", destination: " , " })).toEqual({ city: "Somewhere warm", country: "" });
  });
});

describe("cityScale", () => {
  it("sets shorter names larger", () => {
    expect(cityScale("Kyoto")).toBe("lg");
    expect(cityScale("Amalfi Coast")).toBe("md");
    expect(cityScale("Rio de Janeiro State")).toBe("sm");
  });

  it("steps down for a long single word, which cannot wrap", () => {
    expect(cityScale("Montreal")).toBe("md");
    expect(cityScale("Reykjavik")).toBe("md");
    expect(cityScale("Thessaloniki")).toBe("sm");
  });
});

describe("stampParts", () => {
  it("reads month and day straight from the date", () => {
    expect(stampParts("2026-10-12")).toEqual({ month: "OCT", day: "12" });
    expect(stampParts("2027-03-05")).toEqual({ month: "MAR", day: "5" });
  });

  it("is null for a missing or malformed date", () => {
    expect(stampParts(null)).toBeNull();
    expect(stampParts("soon")).toBeNull();
    expect(stampParts("2026-13-01")).toBeNull();
  });
});

describe("firstSavedPhotoByTrip", () => {
  it("takes the first photo of the newest saved place that has one, per trip", () => {
    const rows = [
      { trip_id: "a", places: { metadata: { photoNames: [] } } },
      { trip_id: "a", places: { metadata: { photoNames: ["places/1/photos/x", "places/1/photos/y"] } } },
      { trip_id: "a", places: { metadata: { photoNames: ["places/2/photos/z"] } } },
      { trip_id: "b", places: [{ metadata: { photoNames: ["places/3/photos/w"] } }] },
      { trip_id: "c", places: null },
      { trip_id: "d", places: { metadata: { photoNames: [42, ""] } } },
    ];
    const result = firstSavedPhotoByTrip(rows);
    expect(result.get("a")).toBe("places/1/photos/x");
    expect(result.get("b")).toBe("places/3/photos/w");
    expect(result.has("c")).toBe(false);
    expect(result.has("d")).toBe(false);
  });
});
