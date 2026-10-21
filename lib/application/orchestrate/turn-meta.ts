import type { AssistantBlock, AssistantTurnMeta } from "@/packages/contracts/assistant";
import type { ResolvedTurn } from "@/lib/application/turn-resolver";
import type { TrivialKind } from "@/lib/application/orchestrate/turn-complexity";

/** Which tab-like surface a turn's answer belongs to (what the chat opens beside the reply). */
export function surfaceForIntent(intent: ResolvedTurn["intent"]): AssistantTurnMeta["surface"] {
  if (["discovery", "nightlife", "food", "activities", "history_culture", "compare"].includes(intent)) return "explore";
  if (intent === "stays") return "stay";
  if (intent === "transport") return "transport";
  if (intent === "weather" || intent === "essentials") return "essentials";
  return "chat";
}

/** Canned reply for a trivial turn, by phrase kind — no model call, so wording is fixed rather
 *  than reworded per request. Only ever reached for one of turn-complexity.ts's hand-curated
 *  English phrases, so a fixed English reply (no language-matching model call to do) is safe. */
export function trivialReply(kind: TrivialKind, destination?: string | null): string {
  const trip = destination ? ` for your ${destination} trip` : " for your trip";
  switch (kind) {
    case "greeting":
      return `Hey! Happy to help — what would you like to plan${trip} next?`;
    case "thanks":
      return `You're welcome! Let me know if there's anything else${trip}.`;
    case "farewell":
      return `Take care! Come back anytime to keep planning${trip}.`;
    case "acknowledgment":
      return `Got it — let me know what's next${trip}.`;
  }
}

/** The one-line decline for a message with no connection to travel or this trip. */
export const deflectionReply = (destination: string) =>
  `I can't help with that — I'm here to help plan and get the most out of your ${destination} trip. Ask me about places, food, getting around, what to book, or anything to do while you're there.`;

type Receipt = AssistantBlock | null | undefined;

/** Meta for a canned reply. Hand-built, not derived from a shared default — if `AssistantTurnMeta` grows a new
 *  OPTIONAL field later, TypeScript won't force this literal to set it (only a new REQUIRED field would). */
export function cannedMeta(language: string): AssistantTurnMeta {
  return { language, locationFocus: null, surface: "chat", blocks: [], sources: [], suggestedFollowups: [], unavailableProviders: [] };
}

/** Meta for an out-of-scope decline: nothing but the trip-update receipt, if the message also changed the trip. */
export function declinedMeta(input: { language: string; locationFocus: string | null; receipt: Receipt }): AssistantTurnMeta {
  return { language: input.language, locationFocus: input.locationFocus, surface: "chat", blocks: input.receipt ? [input.receipt] : [], sources: [], suggestedFollowups: [], unavailableProviders: [] };
}

/** Meta for a clarifying question: the receipt (if any), then the question with its answer chips. */
export function clarifyMeta(input: { language: string; locationFocus: string | null; receipt: Receipt; clarify: { question: string; chips: string[] }; suggestedFollowups: AssistantTurnMeta["suggestedFollowups"] }): AssistantTurnMeta {
  return {
    language: input.language,
    locationFocus: input.locationFocus,
    surface: "chat",
    blocks: [
      ...(input.receipt ? [input.receipt] : []),
      { type: "clarifying_question", question: input.clarify.question, chips: input.clarify.chips },
    ],
    sources: [],
    suggestedFollowups: input.suggestedFollowups,
    unavailableProviders: [],
  };
}

/** Meta for "nothing came back to ground an answer": the receipt, the retry actions, and which providers failed (first 12). */
export function ungroundedMeta(input: { language: string; locationFocus: string | null; receipt: Receipt; actions: AssistantBlock | null | undefined; suggestedFollowups: AssistantTurnMeta["suggestedFollowups"]; unavailableProviders: string[] }): AssistantTurnMeta {
  return {
    language: input.language,
    locationFocus: input.locationFocus,
    surface: "chat",
    blocks: [...(input.receipt ? [input.receipt] : []), ...(input.actions ? [input.actions] : [])],
    sources: [],
    suggestedFollowups: input.suggestedFollowups,
    unavailableProviders: input.unavailableProviders.slice(0, 12),
  };
}

/** Meta for a turn that goes on to COMPOSE (or a lead-in): the cards, the web sources, and what could not be looked up. */
export function readyMeta(input: {
  language: string;
  locationFocus: string | null;
  intent: ResolvedTurn["intent"];
  blocks: AssistantBlock[];
  sources: Array<{ title: string; url: string }>;
  retrievedAt: string;
  suggestedFollowups: AssistantTurnMeta["suggestedFollowups"];
  proposedCommand: AssistantTurnMeta["proposedCommand"];
  unavailableProviders: string[];
  degraded?: boolean;
}): AssistantTurnMeta {
  const { intent, sources, unavailableProviders } = input;
  return {
    language: input.language,
    locationFocus: input.locationFocus,
    surface: surfaceForIntent(intent),
    blocks: input.blocks,
    sources: sources.map((source) => ({ title: source.title, url: source.url, retrievedAt: input.retrievedAt, trust: "sourced" as const })),
    suggestedFollowups: input.suggestedFollowups,
    proposedCommand: input.proposedCommand,
    // A far-future trip can't have a live forecast — if we answered the weather from seasonal
    // web sources, don't also tell the user we "could not check weather".
    unavailableProviders: ((intent === "weather" || intent === "essentials") && sources.length > 0
      ? unavailableProviders.filter((provider) => provider !== "openweather")
      : unavailableProviders
    ).slice(0, 12),
    ...(input.degraded ? { degraded: true } : {}),
  };
}

/** The cards a reply can point the traveller to ("tap the route card…"), named only when they are really on screen. */
export function mapCardsFor(input: {
  evidence: { routes: unknown[]; stays: Array<{ options?: Array<{ latitude?: number | null }> }> };
  cardPlaces: Array<{ latitude?: number | null; longitude?: number | null }>;
  itineraryBlock: AssistantBlock | null | undefined;
}): string[] {
  const { evidence, cardPlaces, itineraryBlock } = input;
  return [
    evidence.routes.length > 0 ? "the route card (tap an option on it, or its Map button, to see every way there step by step with the route on a map)" : "",
    cardPlaces.some((place) => place.latitude || place.longitude) ? "the place cards" : "",
    evidence.stays.some((search) => search.options?.some((option) => option.latitude != null)) ? "the hotel cards" : "",
    itineraryBlock?.type === "itinerary" && itineraryBlock.days.some((day) => day.stops.some((stop) => stop.placeId)) ? "the itinerary" : "",
  ].filter(Boolean);
}
