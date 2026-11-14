import { describe, expect, it } from "vitest";
import { cardLeadIn, looksLikePlainLookup, tripUpdateLeadIn } from "@/lib/application/orchestrate/card-lead-in";
import type { AssistantBlock } from "@/packages/contracts/assistant";

const route = (mode: string, seconds: number) => ({ type: "route_summary", from: "Toronto, Ontario, Canada", to: "Niagara Falls, Ontario, Canada", mode, durationSeconds: seconds, distanceMeters: 1, steps: [], retrievedAt: "t" }) as unknown as AssistantBlock;
const places = (n: number) => ({ type: "place_list", places: Array.from({ length: n }, (_, i) => ({ providerId: `p${i}`, name: `P${i}` })) }) as unknown as AssistantBlock;
const actions = { type: "actions", items: [{ label: "x", prompt: "x" }] } as AssistantBlock;

describe("cardLeadIn", () => {
  it("names the quickest way when several routes are shown", () => {
    expect(cardLeadIn([route("transit", 5400), route("driving", 4800), actions], null, null)).toBe("Here are the ways to get from Toronto to Niagara Falls. Driving is quickest at 1 h 20 min.");
  });

  it("states a single route's time", () => {
    expect(cardLeadIn([route("walking", 2700)], null, null)).toBe("Walking from Toronto to Niagara Falls takes 45 min.");
  });

  it("names where to start without counting the rest, and without quoting the planner's search words", () => {
    const rated = { type: "place_list", places: [{ providerId: "a", name: "Pink Mamma", rating: 4.7, userRatingCount: 9000 }, { providerId: "b", name: "Sphère", rating: 4.8, userRatingCount: 300 }, { providerId: "c", name: "La Coupole", rating: 4.4 }] } as unknown as AssistantBlock;
    expect(cardLeadIn([rated], "Paris, France", "top sights and restaurants to visit")).toBe("Sphère is where I'd start in Paris, rated 4.8 from 300 reviews.");
    expect(cardLeadIn([places(6)], "Niagara Falls, Ontario", "parks")).toBe("6 places in Niagara Falls, best matches first.");
    expect(cardLeadIn([places(1)], "Niagara Falls, Ontario", null)).toBe("P0 is the one place that fits in Niagara Falls.");
  });

  it("never ends on a count of the other places", () => {
    const list = { type: "place_list", places: [{ providerId: "a", name: "A", rating: 4.5, userRatingCount: 500 }, { providerId: "b", name: "B", rating: 4.4, userRatingCount: 500 }, { providerId: "c", name: "C", rating: 4.3, userRatingCount: 500 }] } as unknown as AssistantBlock;
    expect(cardLeadIn([list], "Ibiza, Spain", null)).not.toMatch(/more to compare|\d+ more/);
  });

  it("leads with a place that matches what was asked, not the highest score overall", () => {
    const mixed = { type: "place_list", places: [{ providerId: "a", name: "Prime Steakhouse", category: "steak_house", rating: 4.9 }, { providerId: "b", name: "Taverna do Marisco", category: "seafood_restaurant", rating: 4.8 }] } as unknown as AssistantBlock;
    expect(cardLeadIn([mixed], "Lisbon, Portugal", "best seafood restaurants")).toBe("Taverna do Marisco is where I'd start in Lisbon: a seafood restaurant rated 4.8.");
    expect(cardLeadIn([mixed], "Lisbon, Portugal", "best restaurants")).toContain("Prime Steakhouse");
  });

  it("names one pick per list when two lists are on screen, so it never names a cafe above a row of sights", () => {
    const things = { type: "place_list", title: "Things to do activities", places: [{ providerId: "a", name: "Castle of Ibiza", category: "church", rating: 4.7, userRatingCount: 12000 }, { providerId: "b", name: "Las Dalias de Ibiza", category: "flea_market", rating: 4.2, userRatingCount: 30000 }] } as unknown as AssistantBlock;
    const cafes = { type: "place_list", title: "cafes", places: [{ providerId: "c", name: "One Cup Coffee IBZ LAB | Specialty Coffee", category: "coffee_shop", rating: 5, userRatingCount: 400 }, { providerId: "d", name: "Cafe Mambo", category: "cafe", rating: 4.1, userRatingCount: 9000 }] } as unknown as AssistantBlock;
    expect(cardLeadIn([things, cafes], "Ibiza, Spain", "things to do")).toBe("I'd start with Castle of Ibiza (church, 4.7 from 12k reviews) and One Cup Coffee IBZ LAB (coffee shop, 5.0).");
  });

  it("does not let a 5.0 from a handful of reviews beat a 4.7 from thousands", () => {
    const list = { type: "place_list", places: [{ providerId: "a", name: "Brand New Bar", rating: 5, userRatingCount: 3 }, { providerId: "b", name: "Old Favourite", rating: 4.7, userRatingCount: 9000 }] } as unknown as AssistantBlock;
    expect(cardLeadIn([list], "Ibiza, Spain", null)).toContain("Old Favourite");
  });

  it("reads a Google name like a person would: no tagline, no bracket, no shouting", () => {
    const names = ["Bessa Restaurante(seafood restaurant )", "TAQUERIA LAS REJAS", "Brasa D'Ouro - Steakhouse & Seafood"];
    const lines = names.map((name) => cardLeadIn([{ type: "place_list", places: [{ providerId: "a", name, rating: 4.6, userRatingCount: 2000 }, { providerId: "b", name: "Other", rating: 4.0, userRatingCount: 2000 }] } as unknown as AssistantBlock], "Lisbon, Portugal", null));
    expect(lines[0]).toMatch(/^Bessa Restaurante is where/);
    expect(lines[1]).toMatch(/^Taqueria Las Rejas is where/);
    expect(lines[2]).toMatch(/^Brasa D'Ouro is where/);
    expect(cardLeadIn([{ type: "place_list", places: [{ providerId: "a", name: "A" }] } as unknown as AssistantBlock], null, null)).toBe("A is the one place that fits.");
  });

  it("says nothing when more than one kind of card is shown, or none", () => {
    expect(cardLeadIn([places(3), route("driving", 600)], null, null)).toBeNull();
    expect(cardLeadIn([actions], null, null)).toBeNull();
  });
});

describe("looksLikePlainLookup", () => {
  it("recognises a bare route or what's-on request", () => {
    for (const m of ["from Toronto to niagra", "@Roam from Toronto to niagra", "how do I get to the airport", "directions to the falls", "what's on this weekend"]) expect(looksLikePlainLookup(m)).toBe(true);
  });

  it("leaves anything that asks Roam to judge, or is not a lookup, to the writing model", () => {
    for (const m of ["from Toronto to niagra, what's the cheapest way?", "which way is best to get to the airport", "who are the two travellers?", "is it worth it"]) expect(looksLikePlainLookup(m)).toBe(false);
  });
});

describe("tripUpdateLeadIn", () => {
  const receipt = (...labels: Array<[string, string | null]>) => ({ type: "trip_update", changes: labels.map(([label, to]) => ({ field: label.toLowerCase(), label, from: "x", to })) }) as unknown as AssistantBlock;

  it("confirms what changed without repeating the values the card shows", () => {
    expect(tripUpdateLeadIn([receipt(["Dates", "Sep 30"]), actions])).toBe("Done — dates updated. Undo is on the card if that was not what you meant.");
    expect(tripUpdateLeadIn([receipt(["Dates", "a"], ["Destination", "b"], ["Travellers", "2"])])).toContain("dates, destination and travellers updated");
  });

  it("says changed when something was cleared, and nothing when another card is on screen", () => {
    expect(tripUpdateLeadIn([receipt(["Dates", null])])).toContain("dates changed");
    expect(tripUpdateLeadIn([receipt(["Dates", "a"]), places(2)])).toBeNull();
  });
});
