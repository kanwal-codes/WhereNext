import { describe, expect, it } from "vitest";
import { cardLeadIn, looksLikePlainLookup } from "@/lib/application/orchestrate/card-lead-in";
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

  it("counts the places and quotes a short search", () => {
    expect(cardLeadIn([places(6)], "Niagara Falls, Ontario", "parks")).toBe("Here are 6 places for “parks”.");
    expect(cardLeadIn([places(1)], "Niagara Falls, Ontario", null)).toBe("Here is one place in Niagara Falls.");
  });

  it("says nothing when more than one kind of card is shown, or none", () => {
    expect(cardLeadIn([places(3), route("driving", 600)], null, null)).toBeNull();
    expect(cardLeadIn([actions], null, null)).toBeNull();
  });
});

describe("looksLikePlainLookup", () => {
  it("recognises a bare route or what's-on request", () => {
    for (const m of ["from Toronto to niagra", "how do I get to the airport", "directions to the falls", "what's on this weekend"]) expect(looksLikePlainLookup(m)).toBe(true);
  });

  it("leaves anything that asks Roam to judge, or is not a lookup, to the writing model", () => {
    for (const m of ["from Toronto to niagra, what's the cheapest way?", "which way is best to get to the airport", "who are the two travellers?", "is it worth it"]) expect(looksLikePlainLookup(m)).toBe(false);
  });
});
