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

  it("builds an itinerary block and keeps only placeIds that exist in the evidence", async () => {
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
    expect(stops[1].placeId).toBeUndefined(); // hallucinated id dropped
  });

  it("returns null on an unparseable model response", async () => {
    stubModel("not json");
    const block = await buildItineraryPlan({
      prompt: "plan", tripSummary: "", evidence: evidence([place("a", "One"), place("b", "Two")]), tripCtx,
    });
    expect(block).toBeNull();
  });
});
