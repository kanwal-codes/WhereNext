import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { buildItineraryPlan, dayIndexForDate } from "../../lib/application/itinerary-plan";
import type { RetrievedEvidence } from "../../lib/application/retrieve";

const place = (id: string, name: string) => ({
  provider: "google", providerId: id, name, category: "tourist_attraction",
  latitude: 0, longitude: 0, address: "Somewhere", sourceUrl: null,
});
const evidence = (places: ReturnType<typeof place>[] = []): RetrievedEvidence =>
  ({ places, sources: [], weather: null, routes: [], events: [], flights: [], stays: [], unavailableProviders: [], retrievedAt: "t" }) as unknown as RetrievedEvidence;
const tripCtx = { places: [], itinerary: [], preferences: { pace: "relaxed" } } as never;

afterEach(() => {
  vi.restoreAllMocks();
});

const stubModel = (content: unknown) => {
  generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({
    object: schema.parse(typeof content === "string" ? JSON.parse(content) : content),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
};

describe("buildItineraryPlan", () => {
  it("returns null when there are fewer than two known places", async () => {
    stubModel({ days: [] });
    const block = await buildItineraryPlan({ prompt: "plan our days", tripSummary: "2 travellers", evidence: evidence([place("a", "One")]), tripCtx });
    expect(block).toBeNull();
  });

  it("rejects invented venues rather than just removing their IDs", async () => {
    stubModel({
      title: "2 days in Montréal",
      days: [
        { label: "Day 1", subtitle: "Old town & food", stops: [
          { time: "Morning", title: "Notre-Dame Basilica", note: "Go early to beat crowds", placeId: "p1", kind: "sight" },
          { time: "Evening", title: "Made-up Bar", note: "not real", placeId: "ghost", kind: "nightlife" },
        ] },
      ],
    });
    const block = await buildItineraryPlan({
      prompt: "plan day 1", tripSummary: "2 travellers, relaxed",
      evidence: evidence([place("p1", "Notre-Dame Basilica"), place("p2", "Jean-Talon Market")]), tripCtx,
    });
    expect(block).toMatchObject({ type: "itinerary", title: "2 days in Montréal" });
    const stops = (block as { days: Array<{ stops: Array<{ title: string; placeId?: string }> }> }).days[0].stops;
    expect(stops[0].placeId).toBe("p1"); // real id kept
    expect(stops).toHaveLength(1);
    expect(JSON.stringify(block)).not.toContain("Made-up Bar");
  });

  it("uses the canonical title when an identified venue is paraphrased", async () => {
    stubModel({ days: [{ label: "Day 1", stops: [{ title: "Wrong title", placeId: "p1" }] }] });
    const block = await buildItineraryPlan({ prompt: "plan", tripSummary: "", evidence: evidence([place("p1", "Museum A"), place("p2", "Park B")]), tripCtx });
    expect(block).toMatchObject({ days: [{ stops: [{ title: "Museum A", placeId: "p1" }] }] });
  });

  it("accepts an exact saved venue without allowing arbitrary id-free venues", async () => {
    stubModel({ days: [{ label: "Day 1", stops: [{ title: "Saved Museum" }, { title: "Unknown Palace" }] }] });
    const block = await buildItineraryPlan({ prompt: "plan", tripSummary: "", evidence: evidence([place("p1", "Park B")]), tripCtx: { places: [{ status: "saved", place: { name: "Saved Museum", category: null, address: null } }], itinerary: [], preferences: {} } });
    expect(block).toMatchObject({ days: [{ stops: [{ title: "Saved Museum" }] }] });
    expect(JSON.stringify(block)).not.toContain("Unknown Palace");
  });

  it("returns no plan when all suggested stops are unsupported", async () => {
    stubModel({ days: [{ label: "Day 1", stops: [{ title: "Unknown Palace", placeId: "fake" }] }] });
    expect(await buildItineraryPlan({ prompt: "plan", tripSummary: "", evidence: evidence([place("p1", "Museum A"), place("p2", "Park B")]), tripCtx })).toBeNull();
  });

  it("drops a place already used on an earlier day instead of repeating it", async () => {
    stubModel({
      days: [
        { label: "Day 1", stops: [{ title: "Museum A", placeId: "p1" }, { title: "Park B", placeId: "p2" }] },
        // Day 2 reaches for Museum A again (thin evidence pool) plus one genuinely new place.
        { label: "Day 2", stops: [{ title: "Museum A", placeId: "p1" }, { title: "Tower C", placeId: "p3" }] },
      ],
    });
    const block = await buildItineraryPlan({
      prompt: "plan our days", tripSummary: "",
      evidence: evidence([place("p1", "Museum A"), place("p2", "Park B"), place("p3", "Tower C")]), tripCtx,
    });
    const days = (block as { days: Array<{ stops: Array<{ title: string }> }> }).days;
    expect(days[0].stops.map((s) => s.title)).toEqual(["Museum A", "Park B"]);
    expect(days[1].stops.map((s) => s.title)).toEqual(["Tower C"]); // Museum A repeat dropped, not duplicated
  });

  it("drops a whole day rather than leave it empty when every stop was already used", async () => {
    stubModel({
      days: [
        { label: "Day 1", stops: [{ title: "Museum A", placeId: "p1" }] },
        { label: "Day 2", stops: [{ title: "Museum A", placeId: "p1" }] }, // nothing new left to offer
      ],
    });
    const block = await buildItineraryPlan({
      prompt: "plan our days", tripSummary: "", evidence: evidence([place("p1", "Museum A"), place("p2", "Park B")]), tripCtx,
    });
    const days = (block as { days: Array<unknown> }).days;
    expect(days).toHaveLength(1);
  });

  it("returns null on an unparseable model response", async () => {
    stubModel("not json");
    const block = await buildItineraryPlan({
      prompt: "plan", tripSummary: "", evidence: evidence([place("a", "One"), place("b", "Two")]), tripCtx,
    });
    expect(block).toBeNull();
  });

  describe("anchor event", () => {
    const anchorTripCtx = { places: [], itinerary: [], preferences: {}, trip: { start_date: "2026-11-10" } } as never;
    const anchorEvent = { title: "Drake — It's All A Blur Tour", venue: "Scotiabank Arena", date: "2026-11-13", time: "20:00" };

    it("keeps the model's own anchor stop, on its real day, even with no matching known place", async () => {
      stubModel({
        days: [
          { label: "Day 1", stops: [{ title: "Museum A", placeId: "p1", time: "10:00" }] },
          { label: "Day 2", stops: [{ title: "Park B", placeId: "p2", time: "11:00" }] },
          { label: "Day 4", stops: [{ title: "Museum A", placeId: "p1", time: "11:00" }, { title: "Drake — It's All A Blur Tour", time: "20:00", kind: "event" }] },
        ],
      });
      const block = await buildItineraryPlan({
        prompt: "plan my trip around the Drake concert", tripSummary: "",
        evidence: evidence([place("p1", "Museum A"), place("p2", "Park B")]), tripCtx: anchorTripCtx, anchorEvent,
      });
      const days = (block as { days: Array<{ label: string; stops: Array<{ title: string; kind?: string; time?: string }> }> }).days;
      const day3 = days.find((d) => d.label === "Day 4")!;
      expect(day3.stops).toContainEqual({ title: "Drake — It's All A Blur Tour", time: "20:00", kind: "event", note: "Scotiabank Arena" });
    });

    it("splices the anchor onto its day when the model drops or mistitles it", async () => {
      // Model built Day 4 but never mentioned the concert at all (only a place stop).
      stubModel({
        days: [
          { label: "Day 1", stops: [{ title: "Museum A", placeId: "p1" }] },
          { label: "Day 4", stops: [{ title: "Park B", placeId: "p2" }] },
        ],
      });
      const block = await buildItineraryPlan({
        prompt: "plan my trip around the Drake concert", tripSummary: "",
        evidence: evidence([place("p1", "Museum A"), place("p2", "Park B")]), tripCtx: anchorTripCtx, anchorEvent,
      });
      const days = (block as { days: Array<{ label: string; stops: Array<{ title: string; kind?: string }> }> }).days;
      const day3 = days.find((d) => d.label === "Day 4")!;
      expect(day3.stops.some((s) => s.title === anchorEvent.title && s.kind === "event")).toBe(true);
    });

    it("appends a fresh day for the anchor when the model drops its entire day on a full-trip build", async () => {
      // Only two days came back; the concert's Day 4 (Nov 13, start_date Nov 10) never appears.
      stubModel({
        days: [
          { label: "Day 1", stops: [{ title: "Museum A", placeId: "p1" }] },
          { label: "Day 2", stops: [{ title: "Park B", placeId: "p2" }] },
        ],
      });
      const block = await buildItineraryPlan({
        prompt: "plan my whole trip around the Drake concert", tripSummary: "",
        evidence: evidence([place("p1", "Museum A"), place("p2", "Park B")]), tripCtx: anchorTripCtx, anchorEvent,
      });
      const days = (block as { days: Array<{ label: string; stops: Array<{ title: string }> }> }).days;
      expect(days.map((d) => d.label)).toEqual(["Day 1", "Day 2", "Day 4"]);
      expect(days[2].stops).toEqual([{ title: anchorEvent.title, time: "20:00", kind: "event", note: "Scotiabank Arena" }]);
    });

    it("degrades to ordinary planning when the trip has no start_date to anchor against", async () => {
      stubModel({ days: [{ label: "Day 1", stops: [{ title: "Museum A", placeId: "p1" }, { title: "Park B", placeId: "p2" }] }] });
      const block = await buildItineraryPlan({
        prompt: "plan my trip around the Drake concert", tripSummary: "",
        evidence: evidence([place("p1", "Museum A"), place("p2", "Park B")]),
        tripCtx: { places: [], itinerary: [], preferences: {} } as never,
        anchorEvent,
      });
      expect(JSON.stringify(block)).not.toContain("Drake");
      expect(block).toMatchObject({ days: [{ stops: [{ title: "Museum A" }, { title: "Park B" }] }] });
    });
  });
});

describe("dayIndexForDate", () => {
  it("computes a 1-based day index from the trip's start date", () => {
    expect(dayIndexForDate("2026-11-10", "2026-11-10")).toBe(1);
    expect(dayIndexForDate("2026-11-10", "2026-11-13")).toBe(4);
  });
  it("returns null with no start date, a malformed date, or a date outside a sane trip length", () => {
    expect(dayIndexForDate(undefined, "2026-11-13")).toBeNull();
    expect(dayIndexForDate("2026-11-10", "not-a-date")).toBeNull();
    expect(dayIndexForDate("2026-11-10", "2020-01-01")).toBeNull(); // in the past relative to start
    expect(dayIndexForDate("2026-11-10", "2027-06-01")).toBeNull(); // absurdly far out
  });
});

describe("buildItineraryPlan: the number of days asked for", () => {
  const pool = ["a", "b", "c", "d", "e", "f"].map((id) => place(id, `Place ${id.toUpperCase()}`));
  const day = (n: number, id: string) => ({ label: `Day ${n}`, stops: [{ title: `Place ${id.toUpperCase()}`, placeId: id }] });
  const labels = (block: unknown) => (block as { days: Array<{ label: string }> }).days.map((d) => d.label);

  it("tells the model exactly how many days, ahead of the trip's saved length", async () => {
    stubModel({ days: [day(1, "a")] });
    await buildItineraryPlan({ prompt: "Rome", tripSummary: "", evidence: evidence(pool), tripCtx: { places: [], itinerary: [], preferences: {}, trip: { duration_days: 8 } } as never, requestedDays: 5 });
    const user = JSON.stringify(generateObjectMock.mock.calls.at(-1)?.[0].messages);
    expect(user).toContain("Days to plan: 5 (exactly 5 consecutive days");
  });

  it("numbers a mid-trip plan from where it starts and gives the model the trip calendar", async () => {
    stubModel({ days: [day(7, "a"), day(8, "b")] });
    const trip = { start_date: "2027-06-05", end_date: "2027-06-24", destination: "New York, Rome", duration_days: 20 };
    const block = await buildItineraryPlan({ prompt: "plan Jun 11, 12 and 13 in Rome", tripSummary: "", evidence: evidence(pool), tripCtx: { places: [], itinerary: [], preferences: {}, trip } as never, requestedDays: 3 });
    expect(labels(block)).toEqual(["Day 7", "Day 8", "Day 9"]);
    const user = JSON.stringify(generateObjectMock.mock.calls.at(-1)?.[0].messages);
    expect(user).toContain("Day 7 = 2027-06-11 (Fri)");
  });

  it("keeps a missing day as an open day instead of returning a shorter plan", async () => {
    stubModel({ days: [day(1, "a"), day(2, "b"), day(3, "c"), day(4, "d")] });
    const block = await buildItineraryPlan({ prompt: "plan 5 days", tripSummary: "", evidence: evidence(pool), tripCtx, requestedDays: 5 });
    expect(labels(block)).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"]);
    expect((block as { days: unknown[] }).days[4]).toEqual({ label: "Day 5", subtitle: "Open day", stops: [], open: true });
  });

  it("flags a day that ran out of places as open, with no filler stop to be saved", async () => {
    stubModel({ days: [day(1, "a"), { label: "Day 2", subtitle: "Trastevere stroll", stops: [{ title: "Invented Cafe", placeId: "ghost" }] }] });
    const block = await buildItineraryPlan({ prompt: "plan 2 days", tripSummary: "", evidence: evidence(pool), tripCtx, requestedDays: 2 });
    expect((block as { days: unknown[] }).days[1]).toEqual({ label: "Day 2", subtitle: "Open day", stops: [], open: true });
    expect((block as { days: Array<{ open?: boolean }> }).days[0].open).toBeUndefined();
  });

  it("falls back to no plan when every day is open", async () => {
    stubModel({ days: [{ label: "Day 1", stops: [] }, { label: "Day 2", stops: [] }] });
    expect(await buildItineraryPlan({ prompt: "plan 2 days", tripSummary: "", evidence: evidence(pool), tripCtx, requestedDays: 2 })).toBeNull();
  });

  it("trims a plan that came back longer than asked", async () => {
    stubModel({ days: [1, 2, 3, 4, 5, 6].map((n) => day(n, "abcdef"[n - 1])) });
    expect(labels(await buildItineraryPlan({ prompt: "plan 5 days", tripSummary: "", evidence: evidence(pool), tripCtx, requestedDays: 5 }))).toHaveLength(5);
  });

  it("does not pad an edit of existing days", async () => {
    stubModel({ days: [day(3, "c")] });
    const withExisting = { places: [], itinerary: [{ day_index: 1, title: "x" }, { day_index: 3, title: "y" }], preferences: {} } as never;
    expect(labels(await buildItineraryPlan({ prompt: "redo day 3", tripSummary: "", evidence: evidence(pool), tripCtx: withExisting, requestedDays: null }))).toEqual(["Day 3"]);
  });
});
