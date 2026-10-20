import { describe, expect, it } from "vitest";
import { buildRows, datesError, dateRangeText, groupRows, isWideRow, prefValue, travellersError, type Decision, type Row } from "../../features/workspace/domain/context-rows";

const trip = (over: Record<string, unknown> = {}) => ({ id: "t", name: "T", destination: "Lisbon", duration_days: 7, travelers: 2, start_date: "2026-12-01", end_date: "2026-12-08", ...over }) as never;
const facts = (over: Record<string, unknown> = {}) => ({ destination: "Lisbon", travelers: 2 as number | null, ...over });
const dates = (start = "2026-12-01", end = "2026-12-08") => ({ start, end });
const sugg = (key: string, display: string, rationale = ""): Decision => ({ id: `s-${key}`, kind: "suggestion", source: "assistant", value: { key, display, rationale }, created_at: "2026-10-01T00:00:00Z" });
const rows = (over: Partial<Parameters<typeof buildRows>[0]> = {}) => buildRows({ trip: trip(), tripFacts: facts(), tripDates: dates(), memory: {}, decisions: [], ...over });
const byId = (list: Row[], id: string) => list.find((r) => r.id === id)!;

describe("prefValue", () => {
  it("makes lists from the list-valued preferences", () => {
    expect(prefValue("interests", "food, art ,, jazz")).toEqual(["food", "art", "jazz"]);
    expect(prefValue("dislikes", "")).toEqual([]);
    expect(prefValue("dietaryNeeds", "vegan")).toEqual(["vegan"]);
  });
  it("makes a number of a numeric budget and keeps worded ones as text", () => {
    expect(prefValue("budget", " 250 ")).toBe(250);
    expect(prefValue("budget", "moderate")).toBe("moderate");
    expect(prefValue("budget", "")).toBe("");
    expect(prefValue("pace", " slow ")).toBe("slow");
  });
});

describe("validation and dates", () => {
  it("accepts an empty or whole-number headcount only", () => {
    expect([travellersError(""), travellersError("4"), travellersError("2.5"), travellersError("two")].map((e) => e !== null)).toEqual([false, false, true, true]);
  });
  it("rejects an end before a start, but allows open ranges", () => {
    expect(datesError("2026-12-08", "2026-12-01")).toMatch(/before the start/);
    expect(datesError("2026-12-01", "2026-12-08")).toBeNull();
    expect(datesError("", "2026-12-01")).toBeNull();
    expect(datesError("2026-12-01", "")).toBeNull();
  });
  it("writes the range, an open-ended start, or nothing", () => {
    expect(dateRangeText(dates())).toMatch(/Dec.* – .*Dec/);
    expect(dateRangeText({ start: "2026-12-01", end: "" })).toMatch(/^From .*Dec/);
    expect(dateRangeText({ start: "", end: "" })).toBe("");
  });
});

describe("buildRows", () => {
  it("confirms the trip's own facts", () => {
    const r = rows();
    expect(byId(r, "destination")).toMatchObject({ value: "Lisbon", certainty: "confirmed", tripField: "destination" });
    expect(byId(r, "length")).toMatchObject({ value: "7 days", certainty: "confirmed" });
    expect(byId(r, "travellers")).toMatchObject({ value: "2", certainty: "confirmed", tripField: "travelers" });
    expect(byId(r, "dates")).toMatchObject({ certainty: "confirmed", editable: true });
  });

  it("leaves a missing fact undecided, or suggested when the assistant inferred it (carrying its reason and key)", () => {
    const empty = rows({ trip: trip({ duration_days: null }), tripFacts: facts({ destination: "", travelers: null }), tripDates: dates("", "") });
    expect(["destination", "length", "travellers", "dates"].map((id) => byId(empty, id).certainty)).toEqual(["undecided", "undecided", "undecided", "undecided"]);
    const inferred = rows({ trip: trip({ duration_days: null }), tripFacts: facts({ destination: "", travelers: null }), tripDates: dates("", ""), decisions: [sugg("destination", "Paris", "You mentioned the Eiffel Tower"), sugg("trip_length", "5 days"), sugg("travelers", "3"), sugg("dates", "Early June")] });
    expect(byId(inferred, "destination")).toMatchObject({ certainty: "suggested", value: "Paris", suggestionKey: "destination", note: "You mentioned the Eiffel Tower" });
    expect(byId(inferred, "length")).toMatchObject({ certainty: "suggested", suggestionKey: "trip_length" });
    expect(byId(inferred, "travellers")).toMatchObject({ certainty: "suggested", suggestionKey: "travelers" });
    expect(byId(inferred, "dates")).toMatchObject({ certainty: "suggested", suggestionKey: "dates", editable: true });
  });

  it("counts a solo traveller as one when no headcount is set", () => {
    expect(byId(rows({ tripFacts: facts({ travelers: null }), memory: { groupType: "Solo traveller" } }), "travellers")).toMatchObject({ value: "1 (solo)", certainty: "confirmed" });
  });

  it("prefers a stated value over a suggestion for the same field", () => {
    const r = rows({ memory: { pace: "slow" }, decisions: [sugg("pace", "Packed")] });
    expect(byId(r, "pace")).toMatchObject({ value: "slow", certainty: "confirmed", editKey: "pace" });
  });

  it("writes a plain budget number as money with a per-person-a-day note, but leaves worded budgets alone", () => {
    const numeric = byId(rows({ memory: { budget: "80", currency: "EUR" } }), "budget");
    expect(numeric.value).toMatch(/80/);
    expect(numeric.note).toBe("per person, a day");
    expect(byId(rows({ memory: { budget: "80,5" } }), "budget").value).toMatch(/8[01]/);
    const worded = byId(rows({ memory: { budget: "moderate" } }), "budget");
    expect(worded).toMatchObject({ value: "moderate", certainty: "confirmed" });
    expect(worded.note).toBeUndefined();
  });

  it("joins interests (or likes) and other list preferences", () => {
    expect(byId(rows({ memory: { interests: ["food", "art"] } }), "interests").value).toBe("food, art");
    expect(byId(rows({ memory: { likes: "jazz" } }), "interests").value).toBe("jazz");
    expect(byId(rows({ memory: { dislikes: ["crowds"] } }), "dislikes")).toMatchObject({ value: "crowds", certainty: "confirmed" });
    expect(byId(rows(), "dislikes").certainty).toBe("undecided");
  });

  it("takes the base area and transport from decisions when memory has none", () => {
    const decisions: Decision[] = [
      { id: "1", kind: "stay_area", source: "user", value: "Alfama" as never },
      { id: "2", kind: "transport", source: "user", value: "Metro" as never },
    ];
    const r = rows({ decisions });
    expect(byId(r, "base_area")).toMatchObject({ value: "Alfama", certainty: "confirmed" });
    expect(byId(r, "getting_around")).toMatchObject({ value: "Metro", certainty: "confirmed", editKey: "transport" });
    expect(byId(rows({ memory: { transport: "rental car" }, decisions }), "getting_around").value).toBe("rental car");
  });

  it("shows the locked stay, and the other decisions after it, by who made them", () => {
    const decisions: Decision[] = [
      { id: "1", kind: "stay", source: "user", value: { provider: "liteapi", hotelId: "h", hotelName: "Hotel Lutetia", roomName: "Deluxe", board: null, refundable: true, checkin: "2026-12-01", checkout: "2026-12-08", nights: 7, nightlyAmount: 1, totalAmount: 7, currency: "EUR", latitude: null, longitude: null, address: null, thumbnail: null } },
      { id: "2", kind: "dinner_spot", source: "user", value: "Taberna" as never },
      { id: "3", kind: "museum_pick", source: "assistant", value: "Gulbenkian" as never },
    ];
    const r = rows({ decisions });
    expect(byId(r, "stay")).toMatchObject({ value: "Hotel Lutetia · Deluxe", certainty: "confirmed" });
    expect(byId(r, "dec-2")).toMatchObject({ label: "dinner spot", value: "Taberna", certainty: "confirmed" });
    expect(byId(r, "dec-3").certainty).toBe("suggested");
    expect(byId(rows(), "stay").certainty).toBe("undecided");
  });
});

describe("groupRows", () => {
  it("splits by certainty", () => {
    const g = groupRows(rows({ memory: { pace: "slow" }, decisions: [sugg("occasion", "Birthday")] }), () => false);
    expect(g.confirmed.length + g.suggested.length + g.undecided.length).toBe(rows({ memory: { pace: "slow" }, decisions: [sugg("occasion", "Birthday")] }).length);
    expect(g.suggested.map((r) => r.id)).toEqual(["occasion"]);
  });

  it("stretches the last half-width tile when there is an odd number of them", () => {
    const g = groupRows(rows({ memory: { pace: "slow" } }), () => false);
    const narrow = g.confirmed.filter((r) => !isWideRow(r));
    expect(narrow.length % 2).toBe(1);
    expect(g.loneTile).toBe(narrow[narrow.length - 1]);
    const even = groupRows(rows({ memory: { pace: "slow", occasion: "trip" } }), () => false);
    expect(even.loneTile).toBeNull();
  });

  it("does not count a tile being edited as narrow", () => {
    const g = groupRows(rows({ memory: { pace: "slow" } }), (r) => r.id === "pace");
    expect(g.loneTile?.id).not.toBe("pace");
  });

  it("treats destination, dates, area, stay, decisions and long values as wide", () => {
    const row = (id: string, value = "x"): Row => ({ id, label: id, value, certainty: "confirmed" });
    expect(["destination", "dates", "base_area", "stay", "dec-1"].every((id) => isWideRow(row(id)))).toBe(true);
    expect(isWideRow(row("pace", "a".repeat(21)))).toBe(true);
    expect(isWideRow(row("pace", "slow"))).toBe(false);
  });
});
