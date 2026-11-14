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
/** Words in a place search that say nothing about what is wanted ("best restaurants to visit"). */
const GENERIC_WORDS = new Set(["best", "top", "good", "great", "nice", "places", "place", "things", "near", "nearby", "around", "restaurant", "restaurants", "visit", "some", "where", "find", "want", "local", "famous", "popular", "sights", "attractions"]);

type PlaceLike = { name: string; category?: string | null; rating?: number | null; userRatingCount?: number | null };
/** Google's names carry a tagline or a bracket ("One Cup Coffee IBZ LAB | Specialty Coffee", "Bessa Restaurante(seafood restaurant )") and
 *  sometimes arrive in capitals: the card keeps the full name, the sentence reads like a person wrote it. */
const plain = (name: string) => {
  const head = name.split(/\s[|–—-]\s/)[0].replace(/\s*\([^)]*\)?\s*$/, "").trim() || name;
  return head.length > 3 && head === head.toUpperCase() ? head.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase()) : head;
};
const VAGUE_KINDS = new Set(["point_of_interest", "establishment", "food", "store", "place_of_worship_other"]);
/** "coffee_shop" reads "coffee shop"; Google's catch-all types say nothing and are left out. */
const kindOf = (place: PlaceLike) => (place.category && !VAGUE_KINDS.has(place.category) ? place.category.replace(/_/g, " ") : null);
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
const reviews = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(Math.round(n / 10) * 10));
/** Stars weighted by how many people gave them: a 5.0 from a dozen reviews must not beat a 4.7 from nine thousand. */
const credible = (place: PlaceLike) => { const n = place.userRatingCount ?? 0; return ((place.rating ?? 0) * n + 4.2 * 30) / (n + 30); };
/** The place to start with in one list: rated, and among those that match what was asked ("seafood" must not lead with a steakhouse that
 *  merely scores higher), best by weighted rating. */
function pickFrom(places: PlaceLike[], query: string | null): PlaceLike | null {
  const rated = places.filter((place) => typeof place.rating === "number");
  const asked = (query ?? "").toLowerCase().split(/[^\p{L}]+/u).filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word));
  const matching = asked.length ? rated.filter((place) => asked.some((word) => `${place.name} ${place.category ?? ""}`.toLowerCase().includes(word))) : [];
  const pool = matching.length ? matching : rated;
  return pool.reduce<PlaceLike | null>((best, place) => (!best || credible(place) > credible(best) ? place : best), null);
}

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
    const lists = shown.filter((block): block is Extract<AssistantBlock, { type: "place_list" }> => block.type === "place_list");
    const all = lists.flatMap((block) => block.places);
    // The search words are the planner's, not the traveller's ("top sights and restaurants to visit"): never quoted back at them.
    const where = locationFocus ? ` in ${short(locationFocus)}` : "";
    if (all.length === 1) return `${plain(all[0].name)} is the one place that fits${where}.`;
    // One pick per list on screen ("activities" and "cafes" are two lists), so the line never names a cafe above a row of sights.
    const picks = lists.map((block) => pickFrom(block.places, lists.length === 1 ? query : block.title ?? null)).filter((place): place is PlaceLike => place !== null).slice(0, 3);
    if (picks.length === 0) return `${all.length} places${where}, best matches first.`;
    if (picks.length === 1) {
      const top = picks[0];
      return `${plain(top.name)} is where I'd start${where}${kindOf(top) ? `: ${article(kindOf(top)!)} ${kindOf(top)} rated ${top.rating!.toFixed(1)}` : `, rated ${top.rating!.toFixed(1)}`}${top.userRatingCount && top.userRatingCount >= 100 ? ` from ${reviews(top.userRatingCount)} reviews` : ""}.`;
    }
    const detail = (top: PlaceLike) => [kindOf(top), `${top.rating!.toFixed(1)}${top.userRatingCount && top.userRatingCount >= 1000 ? ` from ${reviews(top.userRatingCount)} reviews` : ""}`].filter(Boolean).join(", ");
    return `I'd start with ${picks.map((top) => `${plain(top.name)} (${detail(top)})`).join(" and ")}.`;
  }
  if (first.type === "stays") return `Here are stays in ${short(first.location)}${first.nights ? ` for ${first.nights} night${first.nights === 1 ? "" : "s"}` : ""}.`;
  if (first.type === "flights") return `Here are flights from ${short(first.origin)} to ${short(first.destination)}.`;
  if (first.type === "events") return locationFocus ? `Here is what is on in ${short(locationFocus)}.` : "Here is what is on.";
  return null;
}
