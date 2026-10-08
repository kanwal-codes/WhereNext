import { describe, expect, it } from "vitest";
import { comparisonView, isGap } from "../../features/conversation/domain/comparisonView";

const block = {
  columns: ["Option", "Budget fit", "Solo fit", "Hiking access", "Pace and crowds"],
  rows: [
    { label: "Paris, France", cells: ["Paris, France", "About $89 a day in hostels", "unclear", "unclear", "unclear"] },
    { label: "Amsterdam, Netherlands", cells: ["Amsterdam, Netherlands", "About $76 a day in hostels", "Social hostels aimed at solo travellers", "Unclear from the evidence", "n/a"] },
  ],
  bestForYou: { label: "amsterdam, netherlands" },
};

describe("isGap", () => {
  it("recognises the ways a cell says nothing", () => {
    for (const cell of ["", "  ", "unclear", "Unclear.", "unknown", "n/a", "N/A", "—", "-", "Not stated", "not available", "No data", "unclear from the evidence", "Unclear from the sources."]) expect(isGap(cell), cell).toBe(true);
  });
  it("keeps a cell that has something in it, even if it hedges", () => {
    for (const cell of ["About $76 a day", "Included in a 2026 comparison; exact figures unclear", "Not cheap"]) expect(isGap(cell), cell).toBe(false);
  });
});

describe("comparisonView", () => {
  const view = comparisonView(block);
  it("drops what nobody knows anything about", () => {
    expect(view.attributes.map((a) => a.name)).toEqual(["Budget fit", "Solo fit"]);
  });
  it("blanks a cell that says nothing, keeping the options lined up", () => {
    expect(view.attributes[1].values).toEqual(["", "Social hostels aimed at solo travellers"]);
  });
  it("marks the pick regardless of case", () => {
    expect(view.options).toEqual([{ label: "Paris, France", best: false }, { label: "Amsterdam, Netherlands", best: true }]);
  });
  it("copes with no pick", () => {
    expect(comparisonView({ ...block, bestForYou: null }).options.every((o) => !o.best)).toBe(true);
  });
});
