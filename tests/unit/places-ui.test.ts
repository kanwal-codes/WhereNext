import { describe, expect, it } from "vitest";
import { categoryLabel, secondaryTypes } from "@/lib/places-ui";

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
