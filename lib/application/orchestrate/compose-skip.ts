import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { ResolvedTurn } from "@/lib/application/turn-resolver";
import type { WeatherCard } from "@/lib/application/weather-card";
import { cardLeadIn, looksLikePlainLookup, tripUpdateLeadIn } from "@/lib/application/orchestrate/card-lead-in";

/** The one-line reply a fully-answering block carries on its own: when one exists, COMPOSE's model is not called at all. */
export function composeSkipLineFor(input: {
  intent: ResolvedTurn["intent"];
  budgetBlock: AssistantBlock | null;
  optionsBlock: AssistantBlock | null;
  structuredAnswerBlock: AssistantBlock | null;
  weatherCard: WeatherCard | null;
  itineraryBlock: AssistantBlock | null;
}): string | null {
  const { intent, budgetBlock, optionsBlock, structuredAnswerBlock, weatherCard, itineraryBlock } = input;
  const line: string | null =
    (budgetBlock?.type === "budget" && budgetBlock.summary) ||
    (optionsBlock?.type === "options" && optionsBlock.intro) ||
    (structuredAnswerBlock?.type === "structured_answer" && structuredAnswerBlock.intro) ||
    (weatherCard && (intent === "essentials"
      ? `${weatherCard.headline.replace(/[.!?]?\s*$/, "")}. The full checklist is below.`
      : weatherCard.headline)) ||
    (itineraryBlock?.type === "itinerary" && (itineraryBlock.intro || "Here's a rough day-by-day — tell me to rework any day.")) ||
    null;
  return line;
}

/** The deterministic one-liner that stands in for a model-written reply: a card lead-in for a plain lookup, or a receipt line for a plain trip-fact change. */
export function leadInLineFor(input: {
  composeSkipLine: string | null;
  resolved: ResolvedTurn;
  prompt: string;
  language: string;
  hasGrounding: boolean;
  tripUpdateReceipt: AssistantBlock | null;
  sourceCount: number;
  unavailableProviderCount: number;
  blocks: AssistantBlock[];
  locationFocus: string;
}): string | null {
  const { composeSkipLine, resolved, prompt, language, hasGrounding, tripUpdateReceipt, sourceCount, unavailableProviderCount, blocks, locationFocus } = input;
  const firstPlaceQuery = resolved.toolPlan.find((call) => call.tool === "search_places");
  const leadIn =
    !composeSkipLine && (resolved.cardsAnswer || looksLikePlainLookup(prompt)) && hasGrounding && !tripUpdateReceipt && language.toLowerCase().startsWith("en") && sourceCount === 0 && unavailableProviderCount === 0
      ? cardLeadIn(blocks, locationFocus, firstPlaceQuery && firstPlaceQuery.tool === "search_places" ? firstPlaceQuery.query : null)
      : null;

  // A plain "we go Sep 30 to Oct 6": the receipt card says what changed, so confirm in a line instead of writing a reply. Only when the
  // message asked nothing else (no question, no lookup, no plan) and RESOLVE sees nothing to retrieve or build.
  const receiptLine =
    !composeSkipLine && !leadIn && tripUpdateReceipt && resolved.toolPlan.length === 0 && resolved.capabilities.length === 0 && (resolved.intent === "other" || resolved.intent === "trip_memory")
    && !prompt.includes("?") && language.toLowerCase().startsWith("en") && sourceCount === 0
      ? tripUpdateLeadIn(blocks)
      : null;
  return leadIn ?? receiptLine;
}
