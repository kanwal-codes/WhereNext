import type { AssistantBlock } from "@/packages/contracts/assistant";

/**
 * A one-line lead-in for a turn whose answer is entirely in the cards (a route card, a list of places, stays, flights,
 * events): shown instead of a model-written paragraph that would only repeat what the cards already say, which also saves
 * the whole COMPOSE call. Null unless exactly one kind of card is on screen, so the line always describes what is there.
 */

const MODE: Record<string, string> = { driving: "Driving", walking: "Walking", transit: "Transit", cycling: "Cycling", flight: "Flying", train: "Train", bus: "Bus" };
const label = (mode: string) => MODE[mode] ?? mode.charAt(0).toUpperCase() + mode.slice(1);
/** "Toronto, Ontario, Canada" reads as "Toronto" in a sentence. */
const short = (place: string) => place.split(",")[0]?.trim() || place;
const duration = (seconds: number) => {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};

/** RESOLVE is cautious about calling a message a plain lookup (it marked "from Toronto to niagra" as not), so the clear-cut phrasings
 *  are also recognised here: a bare route or "what's on" request with no word asking Roam to judge anything. */
const JUDGING = /\b(best|better|cheap\w*|fast\w*|quick\w*|should|worth|which|why|compare|versus|vs|recommend\w*|prefer\w*|safe\w*|easy|easier|kids?|budget)\b/i;
const PLAIN_LOOKUP = /^\s*(from\s+\S.*\sto\s+\S|how\s+(do|can|would)\s+(i|we)\s+(get|go)\b|(directions?|route|routes|ways?)\s+(from|to)\b|what'?s\s+on\b|what\s+is\s+on\b)/i;
export const looksLikePlainLookup = (message: string) => message.length <= 140 && PLAIN_LOOKUP.test(message) && !JUDGING.test(message);

export function cardLeadIn(blocks: AssistantBlock[], locationFocus: string | null, query: string | null): string | null {
  const shown = blocks.filter((block) => block.type !== "actions" && block.type !== "trip_update");
  const kinds = new Set(shown.map((block) => block.type));
  if (kinds.size !== 1) return null;
  const first = shown[0];

  if (first.type === "route_summary") {
    const routes = shown.filter((block): block is Extract<AssistantBlock, { type: "route_summary" }> => block.type === "route_summary");
    const fastest = routes.reduce((best, route) => (route.durationSeconds < best.durationSeconds ? route : best), routes[0]);
    const trip = `${short(first.from)} to ${short(first.to)}`;
    return routes.length === 1
      ? `${label(first.mode)} from ${trip} takes ${duration(first.durationSeconds)}.`
      : `Here are the ways to get from ${trip}. ${label(fastest.mode)} is quickest at ${duration(fastest.durationSeconds)}.`;
  }
  if (first.type === "place_list") {
    const count = shown.reduce((sum, block) => sum + (block.type === "place_list" ? block.places.length : 0), 0);
    const what = query && query.length <= 60 ? ` for “${query}”` : locationFocus ? ` in ${short(locationFocus)}` : "";
    return count === 1 ? `Here is one place${what}.` : `Here are ${count} places${what}.`;
  }
  if (first.type === "stays") return `Here are stays in ${short(first.location)}${first.nights ? ` for ${first.nights} night${first.nights === 1 ? "" : "s"}` : ""}.`;
  if (first.type === "flights") return `Here are flights from ${short(first.origin)} to ${short(first.destination)}.`;
  if (first.type === "events") return locationFocus ? `Here is what is on in ${short(locationFocus)}.` : "Here is what is on.";
  return null;
}
