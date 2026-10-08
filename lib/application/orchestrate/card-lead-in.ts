import { formatDuration } from "@/lib/format-duration";
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
const duration = (seconds: number) => formatDuration(seconds / 60);

/** "Done — dates updated." for a trip fact changed on the traveller's say-so: the receipt card shows what changed, so the line only needs to
 *  confirm it. Null when the receipt is not the whole reply (any other card shown, or nothing changed). */
export function tripUpdateLeadIn(blocks: AssistantBlock[]): string | null {
  const receipt = blocks.find((block): block is Extract<AssistantBlock, { type: "trip_update" }> => block.type === "trip_update");
  if (!receipt || blocks.some((block) => block.type !== "trip_update" && block.type !== "actions")) return null;
  const labels = receipt.changes.map((change) => change.label.toLowerCase());
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
  const word = receipt.changes.every((change) => change.to !== null) ? "updated" : "changed";
  return `Done — ${list} ${word}. Undo is on the card if that was not what you meant.`;
}

/** RESOLVE is cautious about calling a message a plain lookup (it marked "from Toronto to niagra" as not), so the clear-cut phrasings
 *  are also recognised here: a bare route or "what's on" request with no word asking Roam to judge anything. */
const JUDGING = /\b(best|better|cheap\w*|fast\w*|quick\w*|should|worth|which|why|compare|versus|vs|recommend\w*|prefer\w*|safe\w*|easy|easier|kids?|budget)\b/i;
const PLAIN_LOOKUP = /^\s*(from\s+\S.*\sto\s+\S|how\s+(do|can|would)\s+(i|we)\s+(get|go)\b|(directions?|route|routes|ways?)\s+(from|to)\b|what'?s\s+on\b|what\s+is\s+on\b)/i;
// A group-chat message arrives as "@Roam from Toronto to niagra": the mention is not part of the request.
const withoutMention = (message: string) => message.replace(/^\s*@roam\b[\s,:;-]*/i, "");
export const looksLikePlainLookup = (message: string) => {
  const text = withoutMention(message);
  return text.length <= 140 && PLAIN_LOOKUP.test(text) && !JUDGING.test(text);
};

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
    const all = shown.flatMap((block) => (block.type === "place_list" ? block.places : []));
    const count = all.length;
    // The search words are the planner's, not the traveller's ("top sights and restaurants to visit"): never quoted back at them.
    const where = locationFocus ? ` in ${short(locationFocus)}` : "";
    // A line that says something: which one the ratings favour.
    const rated = all.filter((place) => typeof place.rating === "number");
    const top = rated.reduce<(typeof rated)[number] | null>((best, place) => (!best || (place.rating ?? 0) > (best.rating ?? 0) || ((place.rating ?? 0) === (best.rating ?? 0) && (place.userRatingCount ?? 0) > (best.userRatingCount ?? 0)) ? place : best), null);
    const lead = count === 1 ? `One place${where} to start with.` : `${count} places${where} to start with.`;
    return top && count > 1 ? `${lead} ${top.name} is the top-rated at ${top.rating?.toFixed(1)}.` : lead;
  }
  if (first.type === "stays") return `Here are stays in ${short(first.location)}${first.nights ? ` for ${first.nights} night${first.nights === 1 ? "" : "s"}` : ""}.`;
  if (first.type === "flights") return `Here are flights from ${short(first.origin)} to ${short(first.destination)}.`;
  if (first.type === "events") return locationFocus ? `Here is what is on in ${short(locationFocus)}.` : "Here is what is on.";
  return null;
}
