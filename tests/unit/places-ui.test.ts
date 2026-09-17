import { describe, expect, it } from "vitest";
import { amenityChips, categoryLabel, cityFrom, secondaryTypes } from "@/lib/places-ui";

describe("categoryLabel", () => {
  it("title-cases and de-underscores", () => {
    expect(categoryLabel("historical_landmark")).toBe("Historical Landmark");
    expect(categoryLabel(null)).toBe("Place");
  });
});

describe("secondaryTypes", () => {
  it("drops the primary type, generic containers, and caps the count", () => {
    const chips = secondaryTypes("church", [
      "church",
      "historical_landmark",
      "historical_place",
      "tourist_attraction",
      "place_of_worship",
      "point_of_interest",
      "establishment",
      "association_or_organization",
    ]);
    expect(chips).toEqual(["Historical Landmark", "Historical Place", "Tourist Attraction", "Place Of Worship"]);
  });

  it("returns [] when there is nothing meaningful", () => {
    expect(secondaryTypes("restaurant", ["restaurant", "point_of_interest", "establishment"])).toEqual([]);
  });
});

describe("amenityChips", () => {
  it("labels only the amenities that are actually true", () => {
    expect(amenityChips({ outdoorSeating: true, liveMusic: false, reservable: true })).toEqual(["Outdoor seating", "Reservable"]);
  });

  it("returns [] when nothing is set", () => {
    expect(amenityChips({})).toEqual([]);
  });
});

describe("cityFrom", () => {
  // Live-testing regression (2026-09-16): the old version always took the last two
  // comma-separated segments ("..., City, Country"), which breaks for the very common North
  // American 4-segment shape ("Street, City, Region PostalCode, Country") — it silently grabbed
  // the region+postal segment instead of the city (e.g. "QC H2X 2T6, Canada" for a Montreal
  // address), confirmed live to bias nearby-recommendation searches toward the wrong city
  // entirely (Quebec City sights showing up for a Montreal-address anchor).
  it("skips a region/postal-code segment to find the real city (North American 4-segment address)", () => {
    expect(cityFrom("3481 Boul. Saint-Laurent, Montreal, QC H2X 2T6, Canada")).toBe("Montreal, Canada");
    expect(cityFrom("350 5th Ave, New York, NY 10118, USA")).toBe("New York, USA");
  });

  it("handles a plain 3-segment address the old version already got right", () => {
    expect(cityFrom("10 Downing St, London, UK")).toBe("London, UK");
  });

  it("strips a postal code glued onto the front of the city in the same segment", () => {
    expect(cityFrom("8 Rue de Rivoli, 75001 Paris, France")).toBe("Paris, France");
  });

  it("returns just the country when no segment looks like a real city name", () => {
    expect(cityFrom("Main St, Canada")).toBe("Main St, Canada"); // no code-like segment to skip, best-effort unchanged
    expect(cityFrom("QC H2X 2T6, Canada")).toBe("Canada"); // only a code segment before the country
  });

  it("handles missing/empty input without crashing", () => {
    expect(cityFrom(undefined)).toBe("");
    expect(cityFrom(null)).toBe("");
    expect(cityFrom("")).toBe("");
  });
});
