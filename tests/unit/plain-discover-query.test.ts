import { describe, expect, it } from "vitest";
import { plainDiscoverQuery } from "@/lib/application/ai-search";

describe("plainDiscoverQuery", () => {
  it("answers a bare keyword search itself, as the model's freeText would be", () => {
    expect(plainDiscoverQuery("ramen")).toEqual({ freeText: "ramen", interpretation: "Searching for “ramen”" });
    expect(plainDiscoverQuery("  rooftop   bars ")?.freeText).toBe("rooftop bars");
    expect(plainDiscoverQuery("Crêpes & galettes")?.freeText).toBe("Crêpes & galettes");
  });

  it("leaves a filter, a place or anything long to the model", () => {
    for (const q of ["ramen near the basilica", "cheap sushi", "open now", "best pizza in town", "something quiet for tonight", "vegetarian restaurants under 20", "a b c d e", "x", "café 24h"]) expect(plainDiscoverQuery(q)).toBeNull();
  });
});
