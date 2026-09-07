import { afterEach, describe, expect, it, vi } from "vitest";
import { buildItineraryPlan } from "../../lib/application/itinerary-plan";
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
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

const stubModel = (content: unknown) => {
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "k";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200 }),
  ));
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
});
