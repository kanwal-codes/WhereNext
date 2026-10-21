import { describe, expect, it } from "vitest";
import { cannedMeta, clarifyMeta, declinedMeta, deflectionReply, mapCardsFor, readyMeta, surfaceForIntent, trivialReply, ungroundedMeta } from "../../lib/application/orchestrate/turn-meta";

type Any = Record<string, any>;
const receipt = { type: "trip_update", changes: [] } as never;
const followups = [{ label: "More", prompt: "show more" }] as never;

describe("surfaceForIntent", () => {
  it("sends each kind of question to the surface that shows its answer", () => {
    for (const i of ["discovery", "nightlife", "food", "activities", "history_culture", "compare"]) expect(surfaceForIntent(i as never)).toBe("explore");
    expect(surfaceForIntent("stays")).toBe("stay");
    expect(surfaceForIntent("transport")).toBe("transport");
    expect(surfaceForIntent("weather")).toBe("essentials");
    expect(surfaceForIntent("essentials")).toBe("essentials");
    expect(surfaceForIntent("chitchat")).toBe("chat");
    expect(surfaceForIntent("trip_memory")).toBe("chat");
  });
});

describe("trivialReply", () => {
  it("answers each kind of pleasantry, naming the trip when there is a destination", () => {
    expect(trivialReply("greeting", "Lisbon")).toBe("Hey! Happy to help — what would you like to plan for your Lisbon trip next?");
    expect(trivialReply("thanks", "Lisbon")).toBe("You're welcome! Let me know if there's anything else for your Lisbon trip.");
    expect(trivialReply("farewell", "Lisbon")).toBe("Take care! Come back anytime to keep planning for your Lisbon trip.");
    expect(trivialReply("acknowledgment", "Lisbon")).toBe("Got it — let me know what's next for your Lisbon trip.");
  });

  it("falls back to 'your trip' with no destination", () => {
    expect(trivialReply("greeting")).toContain("for your trip next?");
    expect(trivialReply("thanks", null)).toContain("for your trip.");
    expect(trivialReply("greeting", "")).toContain("for your trip next?");
  });
});

describe("deflectionReply", () => {
  it("declines in one line and says what it can do", () => {
    expect(deflectionReply("Lisbon")).toMatch(/^I can't help with that — I'm here to help plan and get the most out of your Lisbon trip\./);
    expect(deflectionReply("Lisbon")).toContain("places, food, getting around, what to book");
  });
});

describe("the early metas", () => {
  it("canned: nothing but the language", () => {
    expect(cannedMeta("fr")).toEqual({ language: "fr", locationFocus: null, surface: "chat", blocks: [], sources: [], suggestedFollowups: [], unavailableProviders: [] });
  });

  it("declined: the trip-update receipt if the message also changed the trip", () => {
    expect(declinedMeta({ language: "en", locationFocus: "Lisbon", receipt })).toEqual({ language: "en", locationFocus: "Lisbon", surface: "chat", blocks: [receipt], sources: [], suggestedFollowups: [], unavailableProviders: [] });
    expect(declinedMeta({ language: "en", locationFocus: null, receipt: null }).blocks).toEqual([]);
    expect(declinedMeta({ language: "en", locationFocus: null, receipt: undefined }).blocks).toEqual([]);
  });

  it("clarify: the receipt first, then the question with its chips, and the follow-ups", () => {
    const meta = clarifyMeta({ language: "en", locationFocus: "Lisbon", receipt, clarify: { question: "Which month?", chips: ["May", "June"] }, suggestedFollowups: followups });
    expect(meta.blocks).toEqual([receipt, { type: "clarifying_question", question: "Which month?", chips: ["May", "June"] }]);
    expect(meta.suggestedFollowups).toBe(followups);
    expect(clarifyMeta({ language: "en", locationFocus: null, receipt: null, clarify: { question: "?", chips: [] }, suggestedFollowups: [] }).blocks).toHaveLength(1);
  });

  it("ungrounded: the receipt, then the retry actions, and the first twelve failed providers", () => {
    const actions = { type: "actions", items: [] } as never;
    const providers = Array.from({ length: 15 }, (_, i) => `p${i}`);
    const meta = ungroundedMeta({ language: "en", locationFocus: "Lisbon", receipt, actions, suggestedFollowups: followups, unavailableProviders: providers });
    expect(meta.blocks).toEqual([receipt, actions]);
    expect(meta.unavailableProviders).toEqual(providers.slice(0, 12));
    expect(meta.suggestedFollowups).toBe(followups);
    expect(ungroundedMeta({ language: "en", locationFocus: null, receipt: null, actions: null, suggestedFollowups: [], unavailableProviders: [] }).blocks).toEqual([]);
  });
});

describe("readyMeta", () => {
  const base = (over: Any = {}) => ({ language: "en", locationFocus: "Lisbon", intent: "food" as never, blocks: [], sources: [{ title: "T", url: "https://a.example" }], retrievedAt: "2026-12-02T10:00:00Z", suggestedFollowups: followups, proposedCommand: undefined, unavailableProviders: [] as string[], ...over });

  it("carries the surface, the cards and the sources with when they were read", () => {
    const meta = readyMeta(base({ blocks: [{ type: "place_list" }] }));
    expect(meta).toMatchObject({ language: "en", locationFocus: "Lisbon", surface: "explore", blocks: [{ type: "place_list" }] });
    expect(meta.sources).toEqual([{ title: "T", url: "https://a.example", retrievedAt: "2026-12-02T10:00:00Z", trust: "sourced" }]);
  });

  it("keeps the first twelve unavailable providers", () => {
    const providers = Array.from({ length: 15 }, (_, i) => `p${i}`);
    expect(readyMeta(base({ unavailableProviders: providers })).unavailableProviders).toEqual(providers.slice(0, 12));
  });

  it("does not report weather as down when it was answered from web sources", () => {
    const withSources = readyMeta(base({ intent: "weather", unavailableProviders: ["openweather", "places"] }));
    expect(withSources.unavailableProviders).toEqual(["places"]);
    expect(readyMeta(base({ intent: "essentials", unavailableProviders: ["openweather"] })).unavailableProviders).toEqual([]);
  });

  it("still reports weather as down when there were no web sources, or for another intent", () => {
    expect(readyMeta(base({ intent: "weather", sources: [], unavailableProviders: ["openweather"] })).unavailableProviders).toEqual(["openweather"]);
    expect(readyMeta(base({ intent: "food", unavailableProviders: ["openweather"] })).unavailableProviders).toEqual(["openweather"]);
  });

  it("marks a degraded turn, and says nothing otherwise", () => {
    expect(readyMeta(base({ degraded: true })).degraded).toBe(true);
    expect("degraded" in readyMeta(base())).toBe(false);
    expect("degraded" in readyMeta(base({ degraded: false }))).toBe(false);
  });

  it("passes a proposed command through", () => {
    const proposedCommand = { type: "x" } as never;
    expect(readyMeta(base({ proposedCommand })).proposedCommand).toBe(proposedCommand);
  });
});

describe("mapCardsFor", () => {
  const evidence = (over: Any = {}) => ({ routes: [], stays: [], ...over });
  const itinerary = (placeId?: string) => ({ type: "itinerary", days: [{ stops: [{ placeId }] }] }) as never;

  it("names nothing when nothing is on screen", () => {
    expect(mapCardsFor({ evidence: evidence(), cardPlaces: [], itineraryBlock: null })).toEqual([]);
  });

  it("names the route card when there are routes", () => {
    expect(mapCardsFor({ evidence: evidence({ routes: [{}] }), cardPlaces: [], itineraryBlock: undefined })[0]).toContain("the route card");
  });

  it("names the place cards only when one has a place on the map", () => {
    expect(mapCardsFor({ evidence: evidence(), cardPlaces: [{ latitude: 1, longitude: 2 }], itineraryBlock: null })).toEqual(["the place cards"]);
    expect(mapCardsFor({ evidence: evidence(), cardPlaces: [{ latitude: 0, longitude: 5 }], itineraryBlock: null })).toEqual(["the place cards"]);
    expect(mapCardsFor({ evidence: evidence(), cardPlaces: [{ latitude: 0, longitude: 0 }, {}], itineraryBlock: null })).toEqual([]);
  });

  it("names the hotel cards only when an option has a latitude", () => {
    expect(mapCardsFor({ evidence: evidence({ stays: [{ options: [{ latitude: 38.7 }] }] }), cardPlaces: [], itineraryBlock: null })).toEqual(["the hotel cards"]);
    expect(mapCardsFor({ evidence: evidence({ stays: [{ options: [{ latitude: null }] }, {}] }), cardPlaces: [], itineraryBlock: null })).toEqual([]);
    expect(mapCardsFor({ evidence: evidence({ stays: [{ options: [{ latitude: 0 }] }] }), cardPlaces: [], itineraryBlock: null })).toEqual(["the hotel cards"]); // on the equator is still a place
  });

  it("names the itinerary only when it is shown and a stop is a real place", () => {
    expect(mapCardsFor({ evidence: evidence(), cardPlaces: [], itineraryBlock: itinerary("p1") })).toEqual(["the itinerary"]);
    expect(mapCardsFor({ evidence: evidence(), cardPlaces: [], itineraryBlock: itinerary(undefined) })).toEqual([]);
    expect(mapCardsFor({ evidence: evidence(), cardPlaces: [], itineraryBlock: { type: "budget" } as never })).toEqual([]);
  });

  it("lists them in the order route, places, hotels, itinerary", () => {
    const out = mapCardsFor({ evidence: evidence({ routes: [{}], stays: [{ options: [{ latitude: 1 }] }] }), cardPlaces: [{ latitude: 1 }], itineraryBlock: itinerary("p") });
    expect(out.map((s) => s.split(" (")[0])).toEqual(["the route card", "the place cards", "the hotel cards", "the itinerary"]);
  });
});
