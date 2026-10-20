import { describe, expect, it } from "vitest";
import { dedupeFacilities, directionsUrl, facilityGroup, groupFacilities, headlineFacilities, prettyCountry, prettyTraveller, reviewDigest, reviewerLine } from "../../features/stays/domain/stay-view";
import type { StayReview } from "../../packages/contracts/stay";

const review = (over: Partial<StayReview> = {}): StayReview => ({ rating: 9, headline: "H", positives: null, negatives: null, text: null, date: null, travellerType: null, country: null, name: null, ...over });

describe("facilityGroup / groupFacilities", () => {
  it("sorts a facility into food, comfort, services or on site", () => {
    expect(facilityGroup("Breakfast buffet")).toBe("Food & drink");
    expect(facilityGroup("Air conditioning")).toBe("Comfort");
    expect(facilityGroup("Luggage storage")).toBe("Services");
    expect(facilityGroup("Garden")).toBe("On site");
  });
  it("groups the first 32", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Garden ${i}`);
    expect(groupFacilities(many)["On site"]).toHaveLength(32);
    expect(groupFacilities(["Bar", "Lift"])).toEqual({ "Food & drink": ["Bar"], Comfort: ["Lift"] });
  });
});

describe("headlineFacilities and dedupeFacilities", () => {
  it("picks up to eight headline facilities", () => {
    expect(headlineFacilities(["Spa", "Free WiFi", "Parking"])).toEqual(["Free WiFi", "Parking"]);
    expect(headlineFacilities(Array.from({ length: 12 }, (_, i) => `WiFi ${i}`))).toHaveLength(8);
  });
  it("treats 'free', 'available' and 'complimentary' as noise when comparing", () => {
    expect(dedupeFacilities(["Free WiFi", "WiFi available", "Complimentary breakfast", "Breakfast", "Spa"])).toEqual(["Free WiFi", "Complimentary breakfast", "Spa"]);
  });
});

describe("pretty names", () => {
  it("words a traveller type", () => {
    expect(prettyTraveller("family_with_children")).toBe("Family with children");
    expect(prettyTraveller(null)).toBe("");
  });
  it("names a two-letter country, and leaves anything else", () => {
    expect(prettyCountry("se")).toBe("Sweden");
    expect(prettyCountry("SE")).toBe("Sweden");
    expect(prettyCountry("Sweden")).toBe("Sweden");
    expect(prettyCountry(null)).toBe("");
  });
});

describe("reviewDigest", () => {
  it("averages the scores and keeps reviews with something written", () => {
    const d = reviewDigest([review({ rating: 10 }), review({ rating: 8 }), review({ rating: 5, headline: null }), review({ rating: null, headline: null, text: "t" })]);
    expect(d.ratedCount).toBe(3);
    expect(d.score).toBeCloseTo(23 / 3, 5);
    expect(d.readable).toHaveLength(3);
  });
  it("has no score without scored reviews", () => {
    expect(reviewDigest([review({ rating: null })]).score).toBeNull();
    expect(reviewDigest([]).readable).toEqual([]);
  });
});

describe("reviewerLine", () => {
  it("joins who and where, adding the name only when public", () => {
    const r = review({ travellerType: "solo_traveller", country: "fr", name: "Ann" });
    expect(reviewerLine(r, false)).toBe("Solo traveller · France");
    expect(reviewerLine(r, true)).toBe("Solo traveller · France · Ann");
    expect(reviewerLine(review(), false)).toBe("");
  });
});

describe("directionsUrl", () => {
  it("uses coordinates when it has them, else the name and address", () => {
    expect(directionsUrl({ latitude: 1.5, longitude: 2.5, address: null, city: null }, "H")).toBe("https://www.google.com/maps/dir/?api=1&destination=1.5,2.5");
    expect(directionsUrl({ latitude: null, longitude: null, address: "1 Rue", city: "Paris" }, "Hotel X")).toBe("https://www.google.com/maps/dir/?api=1&destination=Hotel%20X%2C%201%20Rue%2C%20Paris");
    expect(directionsUrl(null, "Hotel X")).toContain("destination=Hotel%20X");
  });
  it("treats zero coordinates as known", () => {
    expect(directionsUrl({ latitude: 0, longitude: 0, address: null, city: null }, "H")).toContain("destination=0,0");
  });
});
