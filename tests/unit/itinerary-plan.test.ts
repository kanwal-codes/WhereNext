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

/** Every prompt the model was sent in this test: a whole-trip plan is written as one call per day, side by side. */
const everyPrompt = () => JSON.stringify(generateObjectMock.mock.calls.map((call) => call[0].messages));

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

  it("plans exactly the days asked for, ahead of the trip's saved length, one call per day", async () => {
    stubModel({ days: [day(1, "a")] });
    const block = await buildItineraryPlan({ prompt: "Rome", tripSummary: "", evidence: evidence(pool), tripCtx: { places: [], itinerary: [], preferences: {}, trip: { duration_days: 8 } } as never, requestedDays: 5 });
    expect(labels(block)).toHaveLength(5);
    const prompts = generateObjectMock.mock.calls.map((call) => JSON.stringify(call[0].messages));
    expect(prompts).toHaveLength(6); // five days and the intro
    for (const n of [1, 2, 3, 4, 5]) expect(prompts.filter((text) => text.includes(`=== Day ${n}\\n`))).toHaveLength(1);
  });

  it("tells the single-call writer how many days when it edits or plans a stretch", async () => {
    stubModel({ days: [day(1, "a")] });
    await buildItineraryPlan({ prompt: "Rome", tripSummary: "", evidence: evidence(pool), tripCtx: { places: [], itinerary: [], preferences: {}, trip: { duration_days: 20 } } as never, requestedDays: 3 });
    expect(JSON.stringify(generateObjectMock.mock.calls.at(-1)?.[0].messages)).toContain("Days to plan: 3 (exactly 3 consecutive days");
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
    // Three places for five days: the last two days have nothing to be given.
    const block = await buildItineraryPlan({ prompt: "plan 5 days", tripSummary: "", evidence: evidence(pool.slice(0, 3)), tripCtx, requestedDays: 5 });
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

  it("keeps the trip's own length when the model's days run dry, and retitles the plan to the days shown", async () => {
    stubModel({ title: "3 days in Toronto", days: [day(1, "a"), day(2, "b"), day(3, "c")] });
    const trip = { places: [], itinerary: [], preferences: {}, trip: { duration_days: 5 } } as never;
    const block = await buildItineraryPlan({ prompt: "plan my first days", tripSummary: "", evidence: evidence(pool.slice(0, 3)), tripCtx: trip });
    expect(labels(block)).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"]);
    expect((block as { title?: string }).title).toBe("5 days in Toronto");
    expect((block as { days: Array<{ open?: boolean }> }).days.map((d) => d.open ?? false)).toEqual([false, false, false, true, true]);
  });

  describe("a route across cities", () => {
    const paris = ["p0", "p1", "p2"].map((id, i) => place(id, `Paris Spot ${i}`));
    const rome = ["r0", "r1", "r2", "r3"].map((id, i) => place(id, `Rome Spot ${i}`));
    const route = [{ city: "Paris, France", days: 2 }, { city: "Rome, Italy", days: 3 }];
    const ev = { ...evidence([...paris, ...rome]), placeGroups: [{ label: "top attractions", location: "Paris, France", places: paris }, { label: "top attractions", location: "Rome, Italy", places: rome }] } as unknown as RetrievedEvidence;
    const echo = () => generateObjectMock.mockImplementation(async ({ schema, messages }: { schema: { parse: (v: unknown) => unknown }; messages: Array<{ content: string }> }) => {
      const user = messages.at(-1)!.content;
      const days = [...user.matchAll(/=== Day (\d+) \(([^)]+)\)\nCANDIDATES:\n- (.+?) \| id:(\S+)/g)].map((m) => ({ label: `Day ${m[1]}`, subtitle: m[2], stops: [{ time: "10:00", title: m[3], placeId: m[4] }] }));
      return { object: schema.parse(days.length ? { days } : { title: "5 days in Paris, Rome", intro: "Two cities." }), usage: { inputTokens: 1, outputTokens: 1 } };
    });

    it("deals each city's days from that city's places only, in order", async () => {
      echo();
      const block = await buildItineraryPlan({ prompt: "plan 2 days in Paris then 3 in Rome", tripSummary: "", evidence: ev, tripCtx: { places: [], itinerary: [], preferences: {}, trip: { duration_days: 5 } } as never, requestedDays: 5, route });
      const days = (block as { days: Array<{ label: string; subtitle?: string; stops: Array<{ title: string }> }> }).days;
      expect(days.map((d) => d.label)).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"]);
      expect(days.map((d) => d.subtitle)).toEqual(["Paris, France", "Paris, France", "Rome, Italy", "Rome, Italy", "Rome, Italy"]);
      for (const day of days) expect(day.stops.every((s) => s.title.startsWith(day.subtitle!.split(",")[0]))).toBe(true);
    });

    it("plans one place as before when the route is a single city", async () => {
      stubModel({ days: [day(1, "a")] });
      await buildItineraryPlan({ prompt: "plan 2 days", tripSummary: "", evidence: evidence(pool), tripCtx: { places: [], itinerary: [], preferences: {}, trip: { duration_days: 2 } } as never, requestedDays: 2, route: [{ city: "Paris, France", days: 2 }] });
      expect(JSON.stringify(generateObjectMock.mock.calls.map((c) => c[0].messages))).not.toContain("(Paris, France)");
    });
  });

  describe("editing named days", () => {
    const items = [
      { day_index: 1, title: "Place A" }, { day_index: 2, title: "Place B" },
      { day_index: 3, title: "Old Day Three Stop" }, { day_index: 3, title: "Place C" }, { day_index: 4, title: "Place D" },
    ];
    const tripWithPlan = { places: [], itinerary: items, preferences: {} } as never;
    const many = Array.from({ length: 10 }, (_, i) => place(`p${i}`, `Spot ${i}`)).concat([place("a", "Place A"), place("d", "Place D")]);
    const promptsOf = () => generateObjectMock.mock.calls.map((call) => String(call[0].messages.at(-1).content));

    it("rewrites only the days named, offers them nothing the other days already hold, and says the card replaces them", async () => {
      generateObjectMock.mockImplementation(async ({ schema, messages }: { schema: { parse: (v: unknown) => unknown }; messages: Array<{ content: string }> }) => {
        const user = messages.at(-1)!.content;
        const first = user.match(/=== Day 3\nCANDIDATES:\n(?:- .+\n)*?- (Spot \d+) \| id:(\S+)/);
        return { object: schema.parse(user.includes("=== Day") ? { days: [{ label: "Day 3", subtitle: "Slow day", stops: [{ time: "10:00", title: first![1], placeId: first![2] }, { time: "13:00", title: "Old Day Three Stop" }] }] } : { title: "Day 3, slower", intro: "A lighter day." }), usage: { inputTokens: 1, outputTokens: 1 } };
      });
      const block = await buildItineraryPlan({ prompt: "make day 3 more relaxed", tripSummary: "", evidence: evidence(many), tripCtx: tripWithPlan, requestedDays: null });
      expect(block).toMatchObject({ type: "itinerary", replacesDays: true, title: "Day 3, slower" });
      const days = (block as { days: Array<{ label: string; stops: Array<{ title: string }> }> }).days;
      expect(days.map((d) => d.label)).toEqual(["Day 3"]);
      expect(days[0].stops.map((s) => s.title)).toEqual([expect.stringMatching(/^Spot/), "Old Day Three Stop"]); // a new stop, and a current one kept
      const prompts = promptsOf();
      expect(prompts).toHaveLength(2); // the day, and the lead-in: not the whole plan
      expect(prompts.join("\n")).toContain("Current plan"); // what the day holds now
      expect(prompts.join("\n")).not.toContain("| Place A |"); // another day's place is never offered
      expect(prompts.join("\n")).not.toContain("| Place D |");
    });

    it("rewrites several named days side by side", async () => {
      stubModel({ days: [{ label: "Day 2", stops: [{ title: "Spot 0", placeId: "p0" }] }, { label: "Day 4", stops: [{ title: "Spot 1", placeId: "p1" }] }] });
      const block = await buildItineraryPlan({ prompt: "swap days 2 and 4", tripSummary: "", evidence: evidence(many), tripCtx: tripWithPlan, requestedDays: null });
      expect((block as { days: Array<{ label: string }> }).days.map((d) => d.label)).toEqual(["Day 2", "Day 4"]);
      expect(generateObjectMock).toHaveBeenCalledTimes(3); // two days and the lead-in
    });

    it("keeps a plan-wide edit on the single call and does not mark it as replacing days", async () => {
      stubModel({ days: [{ label: "Day 1", stops: [{ title: "Spot 0", placeId: "p0" }] }] });
      const block = await buildItineraryPlan({ prompt: "make the whole plan more relaxed", tripSummary: "", evidence: evidence(many), tripCtx: tripWithPlan, requestedDays: null });
      expect(generateObjectMock).toHaveBeenCalledTimes(1);
      expect(block).not.toHaveProperty("replacesDays");
    });
  });

  describe("written day by day, side by side", () => {
    const many = Array.from({ length: 12 }, (_, i) => place(`p${i}`, `Place ${i}`));
    const dayOf = (text: string) => Number(text.match(/=== Day (\d+)/)?.[1]);
    /** Answers each day-call with the first candidate it was offered, and the intro with a title. */
    const echo = () => generateObjectMock.mockImplementation(async ({ schema, messages }: { schema: { parse: (v: unknown) => unknown }; messages: Array<{ content: string }> }) => {
      const user = messages.at(-1)!.content;
      const days = [...user.matchAll(/=== Day (\d+)\nCANDIDATES:\n- (.+?) \| id:(\S+)/g)].map((m) => ({ label: `Day ${m[1]}`, subtitle: "A day", stops: [{ time: "10:00", title: m[2], placeId: m[3] }] }));
      return { object: schema.parse(days.length ? { days } : { title: "6 days in Toronto", intro: "Six days." }), usage: { inputTokens: 1, outputTokens: 1 } };
    });
    const tripFor = (days: number) => ({ places: [], itinerary: [], preferences: {}, trip: { duration_days: days } }) as never;

    it("gives every day places of its own, so no day is thin and nothing repeats", async () => {
      echo();
      const block = await buildItineraryPlan({ prompt: "plan 6 days", tripSummary: "", evidence: evidence(many), tripCtx: tripFor(6), requestedDays: 6 });
      const days = (block as { days: Array<{ label: string; stops: Array<{ placeId?: string }>; open?: boolean }> }).days;
      expect(days.map((d) => d.label)).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"]);
      expect(days.every((d) => d.stops.length === 1 && !d.open)).toBe(true);
      expect(new Set(days.flatMap((d) => d.stops.map((s) => s.placeId))).size).toBe(6);
      const offered = generateObjectMock.mock.calls.map((call) => String(call[0].messages.at(-1).content)).filter((text) => text.includes("=== Day"));
      const seen = offered.flatMap((text) => [...text.matchAll(/id:(p\d+)/g)].map((m) => m[1]));
      expect(new Set(seen).size).toBe(seen.length); // a place is offered to one day only
      expect((block as { title?: string }).title).toBe("6 days in Toronto");
      expect(offered.map(dayOf).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("falls back to a day's own places when its call fails, rather than leave a hole", async () => {
      generateObjectMock.mockImplementation(async ({ schema, messages }: { schema: { parse: (v: unknown) => unknown }; messages: Array<{ content: string }> }) => {
        const user = messages.at(-1)!.content;
        if (user.includes("=== Day 2")) throw new Error("model hiccup");
        return { object: schema.parse(user.includes("=== Day") ? { days: [{ label: "Day 1", stops: [{ title: "Place 0", placeId: "p0" }] }, { label: "Day 3", stops: [{ title: "Place 2", placeId: "p2" }] }] } : {}), usage: { inputTokens: 1, outputTokens: 1 } };
      });
      const block = await buildItineraryPlan({ prompt: "plan 3 days", tripSummary: "", evidence: evidence(many.slice(0, 9)), tripCtx: tripFor(3), requestedDays: 3 });
      const days = (block as { days: Array<{ stops: Array<{ title: string }>; open?: boolean }> }).days;
      expect(days).toHaveLength(3);
      expect(days[1].stops.length).toBeGreaterThan(0);
      expect(days[1].open).toBeUndefined();
    });

    it("gives up on a plan whose every call failed, so the turn answers in prose instead", async () => {
      generateObjectMock.mockRejectedValue(new Error("down"));
      expect(await buildItineraryPlan({ prompt: "plan 3 days", tripSummary: "", evidence: evidence(many), tripCtx: tripFor(3), requestedDays: 3 })).toBeNull();
    });

    it("keeps a multi-city trip on the single call, which reads the whole calendar", async () => {
      stubModel({ days: [day(1, "a")] });
      const stops = [{ city: "Rome", nights: 3 }, { city: "Florence", nights: 3 }];
      await buildItineraryPlan({ prompt: "plan 6 days", tripSummary: "", evidence: evidence(pool), tripCtx: { places: [], itinerary: [], preferences: {}, trip: { start_date: "2027-06-05", end_date: "2027-06-11", duration_days: 6, stops } } as never, requestedDays: 6 });
      expect(generateObjectMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("trip brief and events", () => {
    const event = (title: string, startDate: string, over: Record<string, unknown> = {}) => ({ title, url: "https://t.example", source: "ticketmaster", venue: "Hall", date: `${startDate} 20:00`, startDate, relToTrip: "in", ...over });
    const withEvents = (events: unknown[], places = pool) => ({ ...evidence(places), events }) as unknown as RetrievedEvidence;
    const trip = { places: [], itinerary: [], preferences: {}, trip: { start_date: "2026-10-09", end_date: "2026-10-11", duration_days: 3 } } as never;
    const stops = (block: unknown) => (block as { days: Array<{ stops: Array<{ title: string; kind?: string; time?: string }> }> }).days.map((d) => d.stops);

    it("puts a listed event on its own day with its real time, and drops it from any other day", async () => {
      stubModel({ days: [
        { label: "Day 1", stops: [{ title: "Place A", placeId: "a" }, { title: "Jazz Night" }] }, // Jazz Night is on Day 2
        { label: "Day 2", stops: [{ title: "Place B", placeId: "b" }, { title: "Jazz Night", time: "10:00" }] },
        { label: "Day 3", stops: [{ title: "Place C", placeId: "c" }] },
      ] });
      const block = await buildItineraryPlan({ prompt: "plan 3 days", tripSummary: "", evidence: withEvents([event("Jazz Night", "2026-10-10")]), tripCtx: trip, requestedDays: 3 });
      expect(everyPrompt()).toContain("Jazz Night | 20:00 | Hall");
      expect(stops(block)[0].map((s) => s.title)).toEqual(["Place A"]);
      expect(stops(block)[1].find((s) => s.title === "Jazz Night")).toMatchObject({ kind: "event", time: "20:00" });
    });

    it("matches an event whose title contains the prompt's own separator", async () => {
      stubModel({ days: [{ label: "Day 1", stops: [{ title: "Place A", placeId: "a" }] }, { label: "Day 2", stops: [{ title: "REMIX GAME#4 / Maple Leafs v Lightning" }] }] });
      const block = await buildItineraryPlan({ prompt: "plan 2 days", tripSummary: "", evidence: withEvents([event("REMIX GAME#4 | Maple Leafs v Lightning", "2026-10-10")]), tripCtx: trip, requestedDays: 2 });
      expect(everyPrompt()).toContain("REMIX GAME#4 / Maple Leafs v Lightning | 20:00 | Hall");
      expect(stops(block)[1]).toEqual([expect.objectContaining({ title: "REMIX GAME#4 | Maple Leafs v Lightning", kind: "event" })]);
    });

    it("does not offer events from outside the trip, and never an invented one", async () => {
      stubModel({ days: [{ label: "Day 1", stops: [{ title: "Place A", placeId: "a" }, { title: "Made Up Gala" }] }] });
      const block = await buildItineraryPlan({ prompt: "plan 1 day", tripSummary: "", evidence: withEvents([event("Far Concert", "2026-12-01", { relToTrip: "after" })]), tripCtx: trip, requestedDays: 1 });
      expect(JSON.stringify(generateObjectMock.mock.calls.at(-1)?.[0].messages)).not.toContain("EVENTS (fixed dates");
      expect(stops(block)[0].map((s) => s.title)).toEqual(["Place A"]);
    });

    it("tags each place with the kind it was found as and gives the model the brief", async () => {
      stubModel({ days: [day(1, "a")] });
      const brief = { confidence: "high", famousFor: "Waterfalls and markets", kinds: [{ label: "Waterfalls", why: "Hamilton is the waterfall capital", origin: "place", placeQuery: "waterfalls and scenic trails", eventQuery: "", scale: "day_trip", weight: 3 }] } as never;
      const ev = { ...evidence(pool), placeGroups: [{ label: "waterfalls and scenic trails", places: [pool[0]] }] } as unknown as RetrievedEvidence;
      await buildItineraryPlan({ prompt: "plan 1 day", tripSummary: "", evidence: ev, tripCtx, requestedDays: 1, brief });
      const user = JSON.stringify(generateObjectMock.mock.calls.at(-1)?.[0].messages);
      expect(user).toContain("kind: Waterfalls, day trip");
      expect(user).toContain("Famous for: Waterfalls and markets");
      expect(user).toContain("Waterfalls (place, weight 3, day trip): Hamilton is the waterfall capital");
    });
  });
});

