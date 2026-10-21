import { describe, expect, it, vi } from "vitest";

const invalidateWorkspace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/workspace-cache", () => ({ invalidateWorkspace }));

import { factAlreadyConfirmed, persistSuggestedFacts, suggestionRows } from "../../lib/application/orchestrate/suggested-facts";

type Any = Record<string, any>;
const ctx = (over: Any = {}, prefs: Any = {}, decisions: Any[] = []) => ({ trip: { destination: null, start_date: null, end_date: null, travelers: null, duration_days: null, ...over }, preferences: prefs, decisions }) as never;

describe("factAlreadyConfirmed", () => {
  it("budget: any stated budget, even zero, but not the empty string", () => {
    expect(factAlreadyConfirmed("budget", ctx({}, { budget: 150 }))).toBe(true);
    expect(factAlreadyConfirmed("budget", ctx({}, { budget: 0 }))).toBe(true);
    expect(factAlreadyConfirmed("budget", ctx({}, { budget: "" }))).toBe(false);
    expect(factAlreadyConfirmed("budget", ctx())).toBe(false);
  });

  it("group, pace, occasion, arrival: a non-empty text", () => {
    expect(factAlreadyConfirmed("group", ctx({}, { groupType: "friends" }))).toBe(true);
    expect(factAlreadyConfirmed("group", ctx({}, { groupType: "" }))).toBe(false);
    expect(factAlreadyConfirmed("pace", ctx({}, { pace: "slow" }))).toBe(true);
    expect(factAlreadyConfirmed("pace", ctx({}, { pace: 3 }))).toBe(false);
    expect(factAlreadyConfirmed("occasion", ctx({}, { occasion: "birthday" }))).toBe(true);
    expect(factAlreadyConfirmed("occasion", ctx())).toBe(false);
    expect(factAlreadyConfirmed("arrival", ctx({}, { arrival: "Friday evening" }))).toBe(true);
    expect(factAlreadyConfirmed("arrival", ctx({}, { arrival: "" }))).toBe(false);
  });

  it("interests: interests or likes, not an empty list", () => {
    expect(factAlreadyConfirmed("interests", ctx({}, { interests: ["art"] }))).toBe(true);
    expect(factAlreadyConfirmed("interests", ctx({}, { likes: ["food"] }))).toBe(true);
    expect(factAlreadyConfirmed("interests", ctx({}, { interests: [], likes: [] }))).toBe(false);
    expect(factAlreadyConfirmed("interests", ctx({}, { interests: "art" }))).toBe(false);
  });

  it("dietary: dietary needs listed", () => {
    expect(factAlreadyConfirmed("dietary", ctx({}, { dietaryNeeds: ["vegan"] }))).toBe(true);
    expect(factAlreadyConfirmed("dietary", ctx({}, { dietaryNeeds: [] }))).toBe(false);
  });

  it("dates: both ends set on the trip, or dates in the preferences", () => {
    expect(factAlreadyConfirmed("dates", ctx({ start_date: "2026-10-01", end_date: "2026-10-05" }))).toBe(true);
    expect(factAlreadyConfirmed("dates", ctx({ start_date: "2026-10-01" }))).toBe(false);
    expect(factAlreadyConfirmed("dates", ctx({}, { dates: "early October" }))).toBe(true);
    expect(factAlreadyConfirmed("dates", ctx({}, { dates: "" }))).toBe(false);
  });

  it("getting around: a stated transport or a transport decision", () => {
    expect(factAlreadyConfirmed("getting_around", ctx({}, { transport: "metro" }))).toBe(true);
    expect(factAlreadyConfirmed("getting_around", ctx({}, {}, [{ kind: "transport" }]))).toBe(true);
    expect(factAlreadyConfirmed("getting_around", ctx({}, { transport: "" }, [{ kind: "stay" }]))).toBe(false);
  });

  it("base area: a stay-area decision", () => {
    expect(factAlreadyConfirmed("base_area", ctx({}, {}, [{ kind: "stay_area" }]))).toBe(true);
    expect(factAlreadyConfirmed("base_area", ctx({}, {}, [{ kind: "stay" }]))).toBe(false);
  });

  it("destination, travelers, trip length: set on the trip", () => {
    expect(factAlreadyConfirmed("destination", ctx({ destination: "Lisbon" }))).toBe(true);
    expect(factAlreadyConfirmed("destination", ctx())).toBe(false);
    expect(factAlreadyConfirmed("travelers", ctx({ travelers: 2 }))).toBe(true);
    expect(factAlreadyConfirmed("travelers", ctx({ travelers: 0 }))).toBe(false);
    expect(factAlreadyConfirmed("trip_length", ctx({ duration_days: 4 }))).toBe(true);
    expect(factAlreadyConfirmed("trip_length", ctx({ duration_days: 0 }))).toBe(false);
  });

  it("an unknown key is never confirmed", () => {
    expect(factAlreadyConfirmed("shoe_size", ctx({ destination: "Lisbon" }, { budget: 1 }))).toBe(false);
  });

  it("works with no trip row", () => {
    expect(factAlreadyConfirmed("destination", { trip: null, preferences: {}, decisions: [] } as never)).toBe(false);
  });
});

describe("suggestionRows", () => {
  const fact = (over: Any = {}) => ({ key: "budget", display: "$150/day", rationale: "said so", ...over });

  it("makes one pending row per unconfirmed fact, keyed so a repeat updates the same row", () => {
    const rows = suggestionRows("trip-1", [fact(), fact({ key: "pace", display: "slow" })] as never, ctx());
    expect(rows).toEqual([
      { trip_id: "trip-1", kind: "suggestion", value: { key: "budget", display: "$150/day", rationale: "said so" }, source: "assistant", idempotency_key: "sugg:budget" },
      { trip_id: "trip-1", kind: "suggestion", value: { key: "pace", display: "slow", rationale: "said so" }, source: "assistant", idempotency_key: "sugg:pace" },
    ]);
  });

  it("skips facts the trip has already confirmed", () => {
    const rows = suggestionRows("t", [fact(), fact({ key: "pace", display: "slow" })] as never, ctx({}, { budget: 100 }));
    expect(rows.map((r) => r.value.key)).toEqual(["pace"]);
  });

  it("carries the dates for a dates suggestion only when both are given", () => {
    const both = suggestionRows("t", [fact({ key: "dates", display: "Oct 1–5", startDate: "2026-10-01", endDate: "2026-10-05" })] as never, ctx());
    expect(both[0].value).toMatchObject({ startDate: "2026-10-01", endDate: "2026-10-05" });
    const one = suggestionRows("t", [fact({ key: "dates", display: "from Oct 1", startDate: "2026-10-01" })] as never, ctx());
    expect("startDate" in one[0].value).toBe(false);
    const other = suggestionRows("t", [fact({ key: "pace", display: "slow", startDate: "2026-10-01", endDate: "2026-10-05" })] as never, ctx());
    expect("startDate" in other[0].value).toBe(false);
  });

  it("has nothing for no facts", () => {
    expect(suggestionRows("t", undefined as never, ctx())).toEqual([]);
    expect(suggestionRows("t", [], ctx())).toEqual([]);
  });
});

describe("persistSuggestedFacts", () => {
  const fact = { key: "pace", display: "slow", rationale: "said so" } as never;
  const client = (result: Any | Error) => {
    const upsert = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
    return { client: { from: vi.fn(() => ({ upsert })) } as never, upsert };
  };

  it("upserts onto the trip and key, then refreshes the workspace", async () => {
    invalidateWorkspace.mockClear();
    const { client: c, upsert } = client({ error: null });
    await persistSuggestedFacts(c, "trip-1", [fact], ctx());
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ trip_id: "trip-1", idempotency_key: "sugg:pace" })], { onConflict: "trip_id,idempotency_key" });
    expect(invalidateWorkspace).toHaveBeenCalledWith("trip-1");
  });

  it("does not touch the database with nothing to save", async () => {
    const { client: c, upsert } = client({ error: null });
    await persistSuggestedFacts(c, "t", [fact], ctx({}, { pace: "slow" }));
    expect(upsert).not.toHaveBeenCalled();
  });

  it("leaves the workspace alone when the database refuses", async () => {
    invalidateWorkspace.mockClear();
    const { client: c } = client({ error: { message: "nope" } });
    await persistSuggestedFacts(c, "t", [fact], ctx());
    expect(invalidateWorkspace).not.toHaveBeenCalled();
  });

  it("never fails the turn, even when the call throws", async () => {
    const { client: c } = client(new Error("network"));
    await expect(persistSuggestedFacts(c, "t", [fact], ctx())).resolves.toBeUndefined();
  });
});
