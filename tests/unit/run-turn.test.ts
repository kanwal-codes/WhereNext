import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveTurnMock, retrieveEvidenceMock } = vi.hoisted(() => ({ resolveTurnMock: vi.fn(), retrieveEvidenceMock: vi.fn() }));
vi.mock("@/lib/application/turn-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/application/turn-resolver")>()),
  resolveTurn: resolveTurnMock,
  MAX_TOOL_CALLS: 6,
}));
vi.mock("@/lib/application/retrieve", () => ({ retrieveEvidence: retrieveEvidenceMock }));

import { runAssistantTurn } from "@/lib/application/orchestrate/run-turn";
import type { TripContext } from "@/lib/application/trip-context";

const tripCtx: TripContext = {
  trip: { name: "T", destination: "Lisbon", origin: null, duration_days: 5, travelers: 2, start_date: null, end_date: null },
  preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], lockedStay: null, accommodationAnchor: null, places: [], decisions: [],
};
const deps = { supabase: {} as never, tripId: "11111111-1111-4111-8111-111111111111" };

afterEach(() => vi.clearAllMocks());

describe("runAssistantTurn — allowPreferenceLearning", () => {
  beforeEach(() => {
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: null, intent: "chitchat", outOfScope: false, capabilities: [], toolPlan: [],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: { dislikes: ["seafood"] }, proposedTripUpdate: null, suggestedFacts: [],
    });
    retrieveEvidenceMock.mockResolvedValue({
      places: [], placeGroups: [], sources: [], weather: null, weatherDays: [], routes: [], events: [], flights: [], stays: [],
      unavailableProviders: [], retrievedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("proposes an update_preferences command by default (personal chat has exactly one unambiguous speaker)", async () => {
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "I hate seafood", history: [], tripSummary: "" });
    if (result.kind !== "ready") throw new Error(`expected kind "ready", got ${result.kind}`);
    expect(result.meta.proposedCommand).toMatchObject({ type: "update_preferences", preferences: { dislikes: ["seafood"] } });
  });

  it("suppresses the command in group chat (allowPreferenceLearning: false) — one member's remark has no clean owner in a shared trip", async () => {
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "I hate seafood", history: [], tripSummary: "", allowPreferenceLearning: false });
    if (result.kind !== "ready") throw new Error(`expected kind "ready", got ${result.kind}`);
    expect(result.meta.proposedCommand).toBeUndefined();
  });
});

describe("runAssistantTurn — trivial turn short-circuit (Phase 2.5)", () => {
  it('skips RESOLVE and RETRIEVE entirely for a pure greeting ("hi")', async () => {
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "hi", history: [], tripSummary: "" });
    expect(resolveTurnMock).not.toHaveBeenCalled();
    expect(retrieveEvidenceMock).not.toHaveBeenCalled();
    if (result.kind !== "ready") throw new Error(`expected kind "ready", got ${result.kind}`);
    expect(result.resolved.intent).toBe("chitchat");
    expect(result.composeTools).toEqual({});
    expect(result.toolPlan).toEqual([]);
    // No model call for a trivial turn — COMPOSE never runs, answered by a canned
    // composeSkipLine instead (see `trivialReply` in run-turn.ts).
    expect(result.composeSkipLine).toContain("Lisbon");
  });

  it("cans a different reply per phrase kind, and drops the trip mention with no destination set", async () => {
    const thanks = await runAssistantTurn(deps, { tripCtx, prompt: "thanks!", history: [], tripSummary: "" });
    if (thanks.kind !== "ready") throw new Error(`expected kind "ready", got ${thanks.kind}`);
    expect(thanks.composeSkipLine).toContain("welcome");

    const noDestination: TripContext = { ...tripCtx, trip: { ...tripCtx.trip!, destination: null } };
    const bye = await runAssistantTurn(deps, { tripCtx: noDestination, prompt: "bye", history: [], tripSummary: "" });
    if (bye.kind !== "ready") throw new Error(`expected kind "ready", got ${bye.kind}`);
    expect(bye.composeSkipLine).not.toContain("null");
    expect(bye.composeSkipLine).toBe("Take care! Come back anytime to keep planning for your trip.");
  });

  it("runs the full RESOLVE/RETRIEVE pipeline for a non-trivial message that merely starts with a trivial word", async () => {
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Rome", intent: "discovery", outOfScope: false, capabilities: [],
      toolPlan: [{ tool: "search_places", query: "things to do", location: "Rome" }],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null, proposedTripUpdate: null, suggestedFacts: [],
    });
    retrieveEvidenceMock.mockResolvedValue({
      places: [{ provider: "g", providerId: "p1", name: "Colosseum", category: "attraction", latitude: 1, longitude: 1, address: null, sourceUrl: null }],
      placeGroups: [], sources: [], weather: null, weatherDays: [], routes: [], events: [], flights: [], stays: [],
      unavailableProviders: [], retrievedAt: "2026-01-01T00:00:00Z",
    });
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "hey, what's good in Rome?", history: [], tripSummary: "" });
    expect(resolveTurnMock).toHaveBeenCalledTimes(1);
    expect(retrieveEvidenceMock).toHaveBeenCalledTimes(1);
    if (result.kind !== "ready") throw new Error(`expected kind "ready", got ${result.kind}`);
    expect(result.resolved.locationFocus).toBe("Rome");
  });
});

describe("runAssistantTurn — meal-time itinerary anchor", () => {
  const timedTripCtx: TripContext = {
    ...tripCtx,
    trip: { ...tripCtx.trip!, start_date: "2026-10-10", duration_days: 5 },
    itinerary: [
      { title: "Visit Mount Royal Park", day_index: 2, position: 0, locked: false, latitude: 45.5016, longitude: -73.5932, time: "18:30" },
    ],
  };

  beforeEach(() => {
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Montreal", intent: "food", outOfScope: false, capabilities: [],
      toolPlan: [{ tool: "search_places", query: "restaurants", location: "Montreal" }],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null, proposedTripUpdate: null, suggestedFacts: [],
    });
    retrieveEvidenceMock.mockResolvedValue({
      places: [], placeGroups: [], sources: [], weather: null, weatherDays: [], routes: [], events: [], flights: [], stays: [],
      unavailableProviders: [], retrievedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("biases the search toward a real, timed itinerary stop for a dinner ask made on that day", async () => {
    await runAssistantTurn(deps, {
      tripCtx: timedTripCtx, prompt: "where should I go for dinner?", history: [], tripSummary: "",
      now: new Date("2026-10-11T17:00:00"), // day 2 of the trip
    });
    const toolPlan = retrieveEvidenceMock.mock.calls[0][0];
    expect(toolPlan[0].location).toContain("Mount Royal Park");
  });

  it("does not bias the search for a non-food intent, even with a matching meal keyword", async () => {
    resolveTurnMock.mockResolvedValue({
      language: "en", locationFocus: "Montreal", intent: "trip_memory", outOfScope: false, capabilities: [],
      toolPlan: [{ tool: "search_places", query: "restaurants", location: "Montreal" }],
      clarify: null, suggestedFollowups: [], proposedProfileUpdate: null, proposedTripUpdate: null, suggestedFacts: [],
    });
    await runAssistantTurn(deps, { tripCtx: timedTripCtx, prompt: "where should I go for dinner?", history: [], tripSummary: "", now: new Date("2026-10-11T17:00:00") });
    const toolPlan = retrieveEvidenceMock.mock.calls[0][0];
    expect(toolPlan[0].location).not.toContain("Mount Royal Park");
  });

  it("does not bias the search before the trip has started", async () => {
    await runAssistantTurn(deps, { tripCtx: timedTripCtx, prompt: "where should I go for dinner?", history: [], tripSummary: "", now: new Date("2026-09-17T17:00:00") });
    const toolPlan = retrieveEvidenceMock.mock.calls[0][0];
    expect(toolPlan[0].location).not.toContain("Mount Royal Park");
  });

  it("does not bias the search when nothing on that day has a real, matching time", async () => {
    await runAssistantTurn(deps, {
      tripCtx: timedTripCtx, prompt: "where should I go for lunch?", history: [], tripSummary: "", // Mount Royal is timed for dinner, not lunch
      now: new Date("2026-10-11T12:00:00"),
    });
    const toolPlan = retrieveEvidenceMock.mock.calls[0][0];
    expect(toolPlan[0].location).not.toContain("Mount Royal Park");
  });
});

describe("runAssistantTurn — nothing came back from RETRIEVE", () => {
  const empty = { places: [], placeGroups: [], sources: [], weather: null, weatherDays: [], routes: [], events: [], flights: [], stays: [], unavailableProviders: ["tavily"], retrievedAt: "2026-01-01T00:00:00Z" };
  const resolve = (toolPlan: unknown[]) => resolveTurnMock.mockResolvedValue({
    language: "en", locationFocus: "Lisbon", intent: "essentials", outOfScope: false, capabilities: [], toolPlan,
    clarify: null, suggestedFollowups: [], proposedProfileUpdate: null, proposedTripUpdate: null, suggestedFacts: [],
  });
  beforeEach(() => retrieveEvidenceMock.mockResolvedValue(empty));

  it("still answers a how-things-work question, from general knowledge, and says what could not be checked", async () => {
    resolve([{ tool: "research_web", query: "Lisbon metro how it works" }]);
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "how does the metro work?", history: [], tripSummary: "" });
    if (result.kind !== "ready") throw new Error(`expected kind "ready", got ${result.kind}`);
    expect(result.composeSkipLine).toBeNull();
    expect(result.system).toContain("well-established general knowledge");
    expect(result.meta.unavailableProviders).toEqual(["tavily"]);
  });

  it("still gives up on a question that needs places, which a model cannot know", async () => {
    resolve([{ tool: "search_places", query: "restaurants", location: "Lisbon" }]);
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "where should we eat?", history: [], tripSummary: "" });
    expect(result.kind).toBe("ungrounded");
  });

  it("gives up when the plan mixes a web read with a places search", async () => {
    resolve([{ tool: "research_web", query: "x" }, { tool: "search_places", query: "restaurants", location: "Lisbon" }]);
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "where should we eat?", history: [], tripSummary: "" });
    expect(result.kind).toBe("ungrounded");
  });

  it("does not use the allowance when the web read did find something", async () => {
    resolve([{ tool: "research_web", query: "Lisbon metro" }]);
    retrieveEvidenceMock.mockResolvedValue({ ...empty, unavailableProviders: [], sources: [{ title: "T", url: "https://a.example", content: "The metro has four lines." }] });
    const result = await runAssistantTurn(deps, { tripCtx, prompt: "how does the metro work?", history: [], tripSummary: "" });
    if (result.kind !== "ready") throw new Error(`expected kind "ready", got ${result.kind}`);
    expect(result.system).not.toContain("well-established general knowledge");
    expect(result.system).toContain("Use only the evidence below");
  });
});
