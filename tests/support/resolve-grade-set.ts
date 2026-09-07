import type { ResolvedTurn } from "@/lib/application/turn-resolver";

/**
 * The frozen grade set for RESOLVE. Each case is a traveller message + the intent and
 * tool set the router *should* produce, per the ROUTING rules in `turn-resolver.ts`.
 *
 * `ideal` is a hand-authored model response for the deterministic subset: the eval replays
 * it through the real `resolveTurn` so every intent family's parse + routing path is guarded
 * in CI without a live call. Cases without `ideal` only run under `EVAL_LIVE=1`.
 *
 * Scoring is a set comparison (see `score-tool-plan.ts`) with a soft floor, so a model that
 * adds one reasonable extra tool still passes; a model that picks the wrong family fails.
 */

export type GradeCase = {
  id: string;
  message: string;
  tripSummary: string;
  expect: { intent: ResolvedTurn["intent"]; tools: string[] };
  ideal?: Partial<ResolvedTurn> & { intent: ResolvedTurn["intent"] };
};

const LISBON = "Profile — dates: soon; group: 4 friends; budget: 150. Trip to Lisbon, Portugal. Itinerary: Jerónimos Monastery (day 2) [locked]. Stay: not locked yet.";
const UNDECIDED = "Profile — group: 2; budget: mid-range. Trip: destination not chosen yet. Itinerary: nothing added yet.";

/** A search_places call the model would emit for `q` in Lisbon. */
const places = (q: string) => ({ tool: "search_places" as const, query: q, location: "Lisbon, Portugal" });
const web = (q: string) => ({ tool: "research_web" as const, query: q });

export const RESOLVE_GRADE_SET: GradeCase[] = [
  // --- place discovery -> search_places -------------------------------------
  {
    id: "nightlife/rooftop-bars",
    message: "what are the best rooftop bars in Lisbon?",
    tripSummary: LISBON,
    expect: { intent: "nightlife", tools: ["search_places"] },
    ideal: { intent: "nightlife", locationFocus: "Lisbon, Portugal", toolPlan: [places("rooftop bars")] },
  },
  {
    id: "food/seafood-old-town",
    message: "where can we get really good seafood near the old town?",
    tripSummary: LISBON,
    expect: { intent: "food", tools: ["search_places"] },
    ideal: { intent: "food", locationFocus: "Alfama, Lisbon, Portugal", toolPlan: [places("seafood restaurants near Alfama old town")] },
  },
  {
    id: "history_culture/museums",
    message: "which museums are worth seeing for first-timers?",
    tripSummary: LISBON,
    expect: { intent: "history_culture", tools: ["search_places"] },
    ideal: { intent: "history_culture", locationFocus: "Lisbon, Portugal", toolPlan: [places("museums")] },
  },
  {
    id: "activities/group-fun",
    message: "recommend some fun activities we could do as a group",
    tripSummary: LISBON,
    expect: { intent: "activities", tools: ["search_places"] },
  },
  {
    id: "discovery/what-to-do",
    message: "what should we do in Lisbon?",
    tripSummary: LISBON,
    expect: { intent: "discovery", tools: ["search_places"] },
  },

  // --- choosing a destination -> research_web, NOT search_places ----------
  {
    id: "discovery/which-destination",
    message: "we haven't picked a place yet — where should we go for a warm beach trip in Europe?",
    tripSummary: UNDECIDED,
    expect: { intent: "discovery", tools: ["research_web"] },
    ideal: { intent: "discovery", locationFocus: null, toolPlan: [web("best warm beach destinations in Europe for a short trip")] },
  },

  // --- stays -> one stays call ------------------------------------------------
  {
    id: "stays/where-to-stay",
    message: "where should we stay in Lisbon?",
    tripSummary: LISBON,
    expect: { intent: "stays", tools: ["stays"] },
    ideal: { intent: "stays", locationFocus: "Lisbon, Portugal", toolPlan: [{ tool: "stays", location: "Lisbon, Portugal" }] },
  },
  {
    id: "stays/hotel-cost",
    message: "roughly how much does a decent hotel cost here?",
    tripSummary: LISBON,
    expect: { intent: "stays", tools: ["stays"] },
  },
  {
    id: "stays/near-airport",
    message: "any good hotels near the airport for our last night?",
    tripSummary: LISBON,
    expect: { intent: "stays", tools: ["stays"] },
  },

  // --- flights -------------------------------------------------------------
  {
    id: "transport/flight-cost",
    message: "how much does it cost to fly from Toronto to Lisbon?",
    tripSummary: LISBON,
    expect: { intent: "transport", tools: ["flights"] },
    ideal: { intent: "transport", locationFocus: "Lisbon, Portugal", toolPlan: [{ tool: "flights", origin: "Toronto", destination: "Lisbon" }] },
  },
  {
    id: "transport/cheapest-flight",
    message: "what's the cheapest flight we can get to Lisbon?",
    tripSummary: LISBON,
    expect: { intent: "transport", tools: ["flights"] },
  },

  // --- directions -------------------------------------------------------------
  {
    id: "transport/directions-two-places",
    message: "how do we get from the Jerónimos Monastery to Belém Tower?",
    tripSummary: LISBON,
    expect: { intent: "transport", tools: ["directions"] },
    ideal: {
      intent: "transport", locationFocus: "Lisbon, Portugal",
      toolPlan: [{ tool: "directions", from: "Jerónimos Monastery, Lisbon", to: "Belém Tower, Lisbon", mode: "transit" }],
    },
  },
  {
    id: "transport/can-we-walk",
    message: "can we walk from our hotel to São Jorge Castle?",
    tripSummary: LISBON,
    expect: { intent: "transport", tools: ["directions"] },
  },
  {
    id: "transport/how-far-daytrip",
    message: "how far is Sintra from Lisbon and how do we get there?",
    tripSummary: LISBON,
    expect: { intent: "transport", tools: ["directions"] },
  },

  // --- weather -------------------------------------------------------------
  {
    id: "weather/now",
    message: "what's the weather like in Lisbon right now?",
    tripSummary: LISBON,
    expect: { intent: "weather", tools: ["weather"] },
    ideal: { intent: "weather", locationFocus: "Lisbon, Portugal", toolPlan: [{ tool: "weather", location: "Lisbon, Portugal" }] },
  },
  {
    id: "weather/seasonal",
    message: "what's the weather usually like in Lisbon in December?",
    tripSummary: LISBON,
    expect: { intent: "weather", tools: ["research_web"] },
    ideal: { intent: "weather", locationFocus: "Lisbon, Portugal", toolPlan: [web("typical weather in Lisbon in December")] },
  },

  // --- events -----------------------------------------------------------------
  {
    id: "events/concerts",
    message: "are there any concerts on in Lisbon while we're there?",
    tripSummary: LISBON,
    expect: { intent: "events", tools: ["events", "research_web"] },
    ideal: {
      intent: "events", locationFocus: "Lisbon, Portugal",
      toolPlan: [{ tool: "events", query: "concerts", location: "Lisbon" }, web("concerts and live music in Lisbon this month")],
    },
  },
  {
    id: "events/whats-on-weekend",
    message: "what's on this weekend — festivals, sports, anything?",
    tripSummary: LISBON,
    expect: { intent: "events", tools: ["events", "research_web"] },
  },
  {
    id: "events/named-artist-during-trip",
    message: "is Bruno Mars playing in Lisbon while we're there?",
    tripSummary: LISBON,
    expect: { intent: "events", tools: ["events", "research_web"] },
  },
  {
    id: "events/category-comedy",
    message: "any stand-up comedy on during our trip?",
    tripSummary: LISBON,
    expect: { intent: "events", tools: ["events", "research_web"] },
  },

  // --- essentials -----------------------------------------------------------
  {
    id: "essentials/packing",
    message: "what should we pack for this trip?",
    tripSummary: LISBON,
    expect: { intent: "essentials", tools: ["weather", "research_web"] },
    ideal: {
      intent: "essentials", locationFocus: "Lisbon, Portugal",
      toolPlan: [{ tool: "weather", location: "Lisbon, Portugal" }, web("Lisbon Portugal travel essentials visa currency etiquette")],
    },
  },
  {
    id: "essentials/visa-currency",
    message: "do we need a visa, and what currency do they use?",
    tripSummary: LISBON,
    expect: { intent: "essentials", tools: ["research_web"] },
  },

  // --- current info -> research_web --------------------------------------
  {
    id: "other/current-situation",
    message: "is the Lisbon metro affected by any strikes right now?",
    tripSummary: LISBON,
    expect: { intent: "other", tools: ["research_web"] },
  },

  // --- trip memory -> no tools -------------------------------------------
  {
    id: "trip_memory/itinerary",
    message: "what's already in our itinerary?",
    tripSummary: LISBON,
    expect: { intent: "trip_memory", tools: [] },
    ideal: { intent: "trip_memory", locationFocus: "Lisbon, Portugal", toolPlan: [] },
  },
  {
    id: "trip_memory/decisions",
    message: "what have we actually decided so far?",
    tripSummary: LISBON,
    expect: { intent: "trip_memory", tools: [] },
  },
  {
    id: "trip_memory/budget-recall",
    message: "remind me what budget we set?",
    tripSummary: LISBON,
    expect: { intent: "trip_memory", tools: [] },
  },

  // --- chitchat -> no tools --------------------------------------------------
  {
    id: "chitchat/thanks",
    message: "thanks, that's really helpful!",
    tripSummary: LISBON,
    expect: { intent: "chitchat", tools: [] },
    ideal: { intent: "chitchat", toolPlan: [] },
  },
  {
    id: "chitchat/greeting",
    message: "hey there",
    tripSummary: LISBON,
    expect: { intent: "chitchat", tools: [] },
  },

  // --- compare ------------------------------------------------------------
  {
    id: "compare/neighbourhoods",
    message: "compare staying in Alfama versus Bairro Alto for us",
    tripSummary: LISBON,
    expect: { intent: "compare", tools: ["search_places"] },
  },
];
