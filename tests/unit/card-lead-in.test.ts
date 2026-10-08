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

  it("counts the places and names the top-rated one, without quoting the planner's search words", () => {
    const rated = { type: "place_list", places: [{ providerId: "a", name: "Pink Mamma", rating: 4.7, userRatingCount: 9000 }, { providerId: "b", name: "Sphère", rating: 4.8, userRatingCount: 300 }, { providerId: "c", name: "La Coupole", rating: 4.4 }] } as unknown as AssistantBlock;
    expect(cardLeadIn([rated], "Paris, France", "top sights and restaurants to visit")).toBe("3 places in Paris to start with. Sphère is the top-rated at 4.8.");
    expect(cardLeadIn([places(6)], "Niagara Falls, Ontario", "parks")).toBe("6 places in Niagara Falls to start with.");
    expect(cardLeadIn([places(1)], "Niagara Falls, Ontario", null)).toBe("One place in Niagara Falls to start with.");
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
