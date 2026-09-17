import { describe, expect, it } from "vitest";
import { computeOverlaps } from "../../features/availability/domain/overlap";

describe("computeOverlaps", () => {
  it("returns nothing for no ranges", () => {
    expect(computeOverlaps([])).toEqual([]);
  });

  it("full-group overlap: everyone free the same days", () => {
    const overlaps = computeOverlaps([
      { userId: "a", startDate: "2026-06-10", endDate: "2026-06-14" },
      { userId: "b", startDate: "2026-06-10", endDate: "2026-06-14" },
    ]);
    expect(overlaps).toEqual([{ startDate: "2026-06-10", endDate: "2026-06-14", userIds: ["a", "b"] }]);
  });

  it("partial overlap: surfaces the subset window alongside the full one", () => {
    const overlaps = computeOverlaps([
      { userId: "a", startDate: "2026-06-10", endDate: "2026-06-20" },
      { userId: "b", startDate: "2026-06-10", endDate: "2026-06-20" },
      { userId: "c", startDate: "2026-06-14", endDate: "2026-06-16" },
    ]);
    // Sorted by coverage descending — the 3-person window (where c overlaps) comes first.
    expect(overlaps[0]).toEqual({ startDate: "2026-06-14", endDate: "2026-06-16", userIds: ["a", "b", "c"] });
    expect(overlaps).toContainEqual({ startDate: "2026-06-10", endDate: "2026-06-13", userIds: ["a", "b"] });
    expect(overlaps).toContainEqual({ startDate: "2026-06-17", endDate: "2026-06-20", userIds: ["a", "b"] });
  });

  it("no overlap: disjoint ranges produce one window per person, not merged", () => {
    const overlaps = computeOverlaps([
      { userId: "a", startDate: "2026-06-01", endDate: "2026-06-05" },
      { userId: "b", startDate: "2026-06-10", endDate: "2026-06-15" },
    ]);
    expect(overlaps).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-05", userIds: ["a"] },
      { startDate: "2026-06-10", endDate: "2026-06-15", userIds: ["b"] },
    ]);
  });

  it("single-day ranges", () => {
    const overlaps = computeOverlaps([
      { userId: "a", startDate: "2026-06-01", endDate: "2026-06-01" },
      { userId: "b", startDate: "2026-06-01", endDate: "2026-06-01" },
    ]);
    expect(overlaps).toEqual([{ startDate: "2026-06-01", endDate: "2026-06-01", userIds: ["a", "b"] }]);
  });

  it("adjacent-but-not-overlapping ranges stay separate windows", () => {
    const overlaps = computeOverlaps([
      { userId: "a", startDate: "2026-06-01", endDate: "2026-06-05" },
      { userId: "b", startDate: "2026-06-06", endDate: "2026-06-10" },
    ]);
    expect(overlaps).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-05", userIds: ["a"] },
      { startDate: "2026-06-06", endDate: "2026-06-10", userIds: ["b"] },
    ]);
  });

  it("dedupes a person's own overlapping ranges instead of double-counting them", () => {
    const overlaps = computeOverlaps([
      { userId: "a", startDate: "2026-06-01", endDate: "2026-06-10" },
      { userId: "a", startDate: "2026-06-05", endDate: "2026-06-15" },
    ]);
    expect(overlaps).toEqual([{ startDate: "2026-06-01", endDate: "2026-06-15", userIds: ["a"] }]);
  });
});
