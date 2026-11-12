import { describe, expect, it } from "vitest";
import { editTargets } from "../../lib/application/edit-days";

describe("editTargets", () => {
  it("reads one day, a list, a range and number words", () => {
    expect(editTargets("make day 3 more relaxed", 5)).toEqual([3]);
    expect(editTargets("swap days 2 and 4", 5)).toEqual([2, 4]);
    expect(editTargets("change days 2, 3 and 5", 5)).toEqual([2, 3, 5]);
    expect(editTargets("redo days 3-5", 5)).toEqual([3, 4, 5]);
    expect(editTargets("redo days 2 to 4", 5)).toEqual([2, 3, 4]);
    expect(editTargets("make day three lighter", 5)).toEqual([3]);
  });

  it("reads the first and last days", () => {
    expect(editTargets("swap the last day for something with kids", 5)).toEqual([5]);
    expect(editTargets("change the last two days", 5)).toEqual([4, 5]);
    expect(editTargets("make the first day slower", 5)).toEqual([1]);
  });

  it("ignores days the plan does not have", () => {
    expect(editTargets("make day 9 relaxed", 5)).toBeNull();
    expect(editTargets("redo days 4-8", 5)).toEqual([4, 5]);
  });

  it("is null for a plan-wide ask or no day at all", () => {
    expect(editTargets("make the whole plan more relaxed", 5)).toBeNull();
    expect(editTargets("redo everything from scratch", 5)).toBeNull();
    expect(editTargets("add more food places", 5)).toBeNull();
    expect(editTargets("make day 3 relaxed", 0)).toBeNull();
  });
});
