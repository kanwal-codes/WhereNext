import { z } from "zod";
import { generateStructured } from "@/packages/ai/model-policy";

export type AiSearchScope = "stays" | "discover" | "getting-around";

/** The Tier-1 keys from the Discover taxonomy — kept here so the API route needn't import UI code. */
export const DISCOVER_CATEGORY_KEYS = ["eat", "nightlife", "sights", "outdoors", "activities", "events", "shopping", "stays"] as const;

/** What the parser is allowed to emit — every field optional, bad values dropped. */
export const aiSearchDirectiveSchema = z.object({
  interpretation: z.string().max(200).optional().catch(undefined),
  location: z.string().max(120).optional().catch(undefined),
  from: z.string().max(120).optional().catch(undefined),
  to: z.string().max(120).optional().catch(undefined),
  modes: z.array(z.enum(["flight", "train", "bus", "transit", "drive", "walk", "ferry"])).optional().catch(undefined),
  categories: z.array(z.string().max(40)).max(4).optional().catch(undefined),
  subChips: z.array(z.string().max(40)).max(8).optional().catch(undefined),
  freeText: z.string().max(160).optional().catch(undefined),
  priceMax: z.number().positive().max(100000).optional().catch(undefined),
  stars: z.array(z.number().int().min(1).max(5)).optional().catch(undefined),
  boards: z.array(z.string().max(40)).optional().catch(undefined),
  propertyTypes: z.array(z.string().max(40)).optional().catch(undefined),
  refundable: z.boolean().optional().catch(undefined),
  sort: z.enum(["price", "rating", "stars"]).optional().catch(undefined),
  adults: z.number().int().min(1).max(24).optional().catch(undefined),
  rooms: z.number().int().min(1).max(8).optional().catch(undefined),
});
export type AiSearchDirective = z.infer<typeof aiSearchDirectiveSchema>;

function prompt(scope: AiSearchScope, ctx: { destination?: string; origin?: string; categories?: string[] }): string {
  const common = `You convert a traveller's plain-language search into a small JSON filter object.
Return ONLY JSON. Include a key ONLY when the sentence says or clearly implies it — never guess or add defaults.
Always include a short "interpretation" (max ~15 words) restating what you understood, e.g. "Hotels within ~1 km of Palais des congrès, 2 guests".`;

  if (scope === "stays") {
    return `${common}
Trip destination: ${ctx.destination || "unknown"}.
Keys you may use:
- location: a specific place the hotel should be near ("near Palais des congrès", "close to YUL airport", "walking distance to the old town"). Put the place name here, add the city if the sentence implies it.
- priceMax (number, nightly), stars (array 1-5), refundable (boolean), sort ("price" | "rating" | "stars"), adults (int), rooms (int), boards (array like ["Breakfast included"]).
- propertyTypes (array like ["Apartment", "Villa", "Guest house"]) — only when they name a stay type instead of "hotel".`;
  }
  if (scope === "discover") {
    return `${common}
Trip destination: ${ctx.destination || "unknown"}.
Available broad categories (use their exact keys): ${(ctx.categories ?? []).join(", ") || "eat, nightlife, sights, nature, activities, culture, shopping, stays"}.
Keys you may use:
- categories: array of the category keys that match the request.
- freeText: the core thing they're looking for, in a few words ("rooftop bars", "vintage record shops", "ramen").
- location: a place to search near, if they named one ("near the Notre-Dame Basilica").`;
  }
  return `${common}
Default from: ${ctx.origin || "unknown"}. Default to: ${ctx.destination || "unknown"}.
Keys you may use:
- from, to: the two endpoints (fall back to the defaults above only if the sentence clearly means "my trip").
- modes: array from ["flight","train","bus","transit","drive","walk","ferry"] — ONLY the modes they asked for. "on a flight" -> ["flight"]. "cheapest way" or nothing specific -> omit (means "all").`;
}

// Words that turn a keyword into a filter or a place ("near the basilica", "cheap ramen", "open now"): the model has to read those.
const FILTERING = /\b(near|nearby|around|close|closest|in|at|by|within|under|over|below|above|cheap\w*|best|good|top|free|open|now|tonight|today|tomorrow|with|without|for|that|which|not|no|only|less|more|than|and|or)\b/i;

/** A bare keyword search ("ramen", "rooftop bars", "record shops"): in Discover it means exactly "search for this", which is what the model
 *  would return as `freeText`, so it is answered without a model call. Anything with a filter or a place in it still goes to the model. */
export function plainDiscoverQuery(query: string): AiSearchDirective | null {
  const text = query.trim().replace(/\s+/g, " ");
  if (text.length < 2 || text.length > 40 || text.split(" ").length > 4) return null;
  if (!/^[\p{L}][\p{L}'’&-]*(?: (?:[\p{L}][\p{L}'’&-]*|&))*$/u.test(text) || FILTERING.test(text)) return null;
  return { freeText: text, interpretation: `Searching for “${text}”` };
}

/** One structured model call: free-text search -> a typed directive. Never throws; returns {} on failure. */
export async function parseAiSearch(
  scope: AiSearchScope,
  query: string,
  ctx: { destination?: string; origin?: string; categories?: string[] },
  signal?: AbortSignal,
): Promise<AiSearchDirective> {
  if (scope === "discover") {
    const plain = plainDiscoverQuery(query);
    if (plain) return plain;
  }
  try {
    return await generateStructured(
      "resolve",
      [
        { role: "system", content: prompt(scope, ctx) },
        { role: "user", content: query.slice(0, 400) },
      ],
      aiSearchDirectiveSchema,
      signal,
    );
  } catch {
    return {};
  }
}
