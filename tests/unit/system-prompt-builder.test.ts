import { describe, expect, it } from "vitest";
import { buildComposeSystemPrompt } from "../../lib/application/orchestrate/system-prompt-builder";
import { evidence } from "../support/fixture-evidence";
import type { TripContext } from "../../lib/application/trip-context";

// Phase 1.3.3 (docs/overhaul/roadmap/phase-1-structural-refactor.md) — the doc's own example of
// what this extraction was meant to make unit-testable ("does the prompt correctly mention
// dislikes") rather than only verifiable by running a whole turn.

const tripCtx: TripContext = {
  trip: null, preferences: {}, itinerary: [], lockedTitles: [], lockedPlaces: [], lockedStay: null, accommodationAnchor: null, places: [], decisions: [],
};

const baseParams = {
  hasGrounding: true,
  locationFocus: "Lisbon",
  viewContext: undefined,
  dislikes: [] as string[],
  accessibilityNeeds: [] as string[],
  surfacedEarlier: new Set<string>(),
  requestedImages: false,
  tripCtx,
  intent: "discovery",
  evidence: evidence(),
  compactSources: [],
  showsItineraryBlock: false,
  showsBudgetBlock: false,
  exploreKind: null,
  eventsGuidance: "",
  compactFlights: [],
  compactStays: [],
  tripSummary: "A 4-day trip to Lisbon.",
  context: "{}",
  compactPlaces: [],
  compactEvents: [],
  photoUrl: (name: string) => `/photo/${name}`,
};

describe("buildComposeSystemPrompt", () => {
  it("mentions dislikes and forbids recommending them, when set", () => {
    const prompt = buildComposeSystemPrompt({ ...baseParams, dislikes: ["museums", "seafood"] });
    expect(prompt).toContain("The traveller dislikes: museums, seafood");
    expect(prompt).toMatch(/Do not recommend.*even if they are famous/);
  });

  it("omits the dislikes line entirely when there are none", () => {
    const prompt = buildComposeSystemPrompt({ ...baseParams, dislikes: [] });
    expect(prompt).not.toContain("The traveller dislikes");
  });

  it("states the accessibility hard constraint when set", () => {
    const prompt = buildComposeSystemPrompt({ ...baseParams, accessibilityNeeds: ["wheelchair accessible"] });
    expect(prompt).toContain("Accessibility requirement (hard constraint): wheelchair accessible");
  });

  it("switches the grounding instruction based on hasGrounding", () => {
    const grounded = buildComposeSystemPrompt({ ...baseParams, hasGrounding: true });
    const ungrounded = buildComposeSystemPrompt({ ...baseParams, hasGrounding: false });
    expect(grounded).toContain("Use only the evidence below for facts");
    expect(ungrounded).toContain("You have no fresh provider evidence for this");
  });

  it("includes viewContext guidance only when the user has something open beside the chat", () => {
    const withView = buildComposeSystemPrompt({ ...baseParams, viewContext: "Belém Tower" });
    const withoutView = buildComposeSystemPrompt({ ...baseParams, viewContext: undefined });
    expect(withView).toContain("The user has this open beside the chat: Belém Tower");
    expect(withoutView).not.toContain("open beside the chat");
  });

  it("carries the trip summary and authorized context JSON verbatim", () => {
    const prompt = buildComposeSystemPrompt({ ...baseParams, tripSummary: "SUMMARY_MARKER", context: '{"marker":true}' });
    expect(prompt).toContain("Trip so far: SUMMARY_MARKER");
    expect(prompt).toContain('{"marker":true}');
  });

  // Live-caught regression: search-places.ts's RETRIEVE handler fetches phone/website/hours
  // specifically so a follow-up like "what time does it open" can be answered, but a place's
  // compaction into `compactPlaces` (run-turn.ts) used to drop those fields before they ever
  // reached this evidence JSON — COMPOSE then had no way to know they existed and told the
  // traveller the data "wasn't in the evidence" even though RETRIEVE had already fetched it.
  it("carries a place's phone/website/opening hours through to the evidence JSON when present", () => {
    const prompt = buildComposeSystemPrompt({
      ...baseParams,
      compactPlaces: [{ name: "Bar George", phone: "+1 514-555-0100", websiteUri: "https://bargeorge.example", openingHours: ["Monday: 5:00 – 2:00 AM"], openNow: true }],
    });
    expect(prompt).toContain("+1 514-555-0100");
    expect(prompt).toContain("bargeorge.example");
    expect(prompt).toContain("Monday: 5:00");
  });

  // Debugging-pass fix: run-turn.ts used to pass RESOLVE's requested capabilities (`caps`)
  // straight through, so a turn where the itinerary/budget BUILDER failed (thin evidence, a
  // timeout) still told COMPOSE the block "is shown" — the model would then confidently
  // reference a card the client never rendered. `showsItineraryBlock`/`showsBudgetBlock` are
  // the caller's own post-hoc check on the awaited builder result, not the request.
  it("only claims an itinerary block is shown when showsItineraryBlock is true", () => {
    const shown = buildComposeSystemPrompt({ ...baseParams, showsItineraryBlock: true });
    const notShown = buildComposeSystemPrompt({ ...baseParams, showsItineraryBlock: false });
    expect(shown).toContain("A day-by-day itinerary is shown as a structured timeline block");
    expect(notShown).not.toContain("A day-by-day itinerary is shown");
  });

  it("only claims a budget block is shown when showsBudgetBlock is true", () => {
    const shown = buildComposeSystemPrompt({ ...baseParams, showsBudgetBlock: true });
    const notShown = buildComposeSystemPrompt({ ...baseParams, showsBudgetBlock: false });
    expect(shown).toContain("A budget breakdown block with per-category figures is shown");
    expect(notShown).not.toContain("A budget breakdown block");
  });

  it("only claims an options card list is shown when exploreKind is set", () => {
    const shown = buildComposeSystemPrompt({ ...baseParams, exploreKind: "area" as const });
    const notShown = buildComposeSystemPrompt({ ...baseParams, exploreKind: null });
    expect(shown).toContain("A card list of neighbourhoods is shown");
    expect(notShown).not.toContain("A card list of");
  });
});
