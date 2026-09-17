import { describe, expect, it } from "vitest";
import { dedupeByFuzzyMatch, jaroWinkler } from "../../lib/application/retrieve/dedupe";

describe("jaroWinkler", () => {
  it("is 1 for identical strings and 0 for completely disjoint ones", () => {
    expect(jaroWinkler("katseye", "katseye")).toBe(1);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });

  it("scores a shared-prefix near-duplicate higher than an unrelated pair", () => {
    // Jaro-Winkler alone under-scores "katseye" vs "katseye world tour" on length difference
    // despite full prefix overlap — dedupeByFuzzyMatch below handles that case with its own
    // containment short-circuit, not by leaning on this score crossing some fixed bar.
    expect(jaroWinkler("katseye", "katseye world tour")).toBeGreaterThan(jaroWinkler("katseye", "symphony"));
    expect(jaroWinkler("bruno mars tour", "bruno mars tou")).toBeGreaterThan(0.9);
  });

  it("handles empty strings without crashing", () => {
    expect(jaroWinkler("", "")).toBe(1);
    expect(jaroWinkler("x", "")).toBe(0);
  });
});

describe("dedupeByFuzzyMatch", () => {
  // Live-testing regression (Phase 5, docs/overhaul/roadmap/phase-5-optional-improvements.md):
  // handleEvents used to just concatenate Ticketmaster + Eventbrite results with no dedup at all.
  const e = (over: Partial<{ title: string; venue?: string; startDate?: string }>) => ({ title: "X", ...over });

  it("drops a near-duplicate title on the same day, keeping the first-listed (provider-priority) copy", () => {
    const out = dedupeByFuzzyMatch([
      e({ title: "Katseye", startDate: "2026-10-29", venue: "Bell Centre" }),
      e({ title: "KATSEYE - World Tour", startDate: "2026-10-29", venue: "Bell Centre" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Katseye");
  });

  it("keeps both when the date differs, even with an identical title", () => {
    const out = dedupeByFuzzyMatch([
      e({ title: "Jazz Night", startDate: "2026-10-29" }),
      e({ title: "Jazz Night", startDate: "2026-10-30" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not merge two distinct same-day events at different venues sharing a generic title", () => {
    const out = dedupeByFuzzyMatch([
      e({ title: "Open Mic Night", startDate: "2026-10-29", venue: "The Cat's Corner" }),
      e({ title: "Open Mic Night", startDate: "2026-10-29", venue: "Riverside Pub" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("falls back to title+date alone when venue is missing on either side — stays permissive, not stricter", () => {
    const out = dedupeByFuzzyMatch([
      e({ title: "Headliner Tour Stop", startDate: "2026-10-29", venue: "Arena" }),
      e({ title: "Headliner Tour Stop", startDate: "2026-10-29" }), // no venue given
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps unrelated titles on the same day", () => {
    const out = dedupeByFuzzyMatch([
      e({ title: "Comedy Night", startDate: "2026-10-29" }),
      e({ title: "Symphony Orchestra", startDate: "2026-10-29" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("treats two undated items as comparable (both null dates match)", () => {
    const out = dedupeByFuzzyMatch([e({ title: "TBD Concert" }), e({ title: "TBD Concert" })]);
    expect(out).toHaveLength(1);
  });

  it("is case/punctuation-insensitive", () => {
    const out = dedupeByFuzzyMatch([
      e({ title: "Bruno Mars: 24K Magic Tour", startDate: "2026-10-29" }),
      e({ title: "bruno mars 24k magic tour", startDate: "2026-10-29" }),
    ]);
    expect(out).toHaveLength(1);
  });
});
