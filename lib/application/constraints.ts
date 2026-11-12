/**
 * Limits a traveller states in so many words ("just give me 3", "under $150 a night", "4 stars or better"). The router's model reads
 * them well enough to choose a search, but nothing carried them to the provider or the cards, so they are read here, in plain code.
 */
const WORDS: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5 };
const COUNT = "(\\d|one|two|three|four|five)";
const THINGS = "(?:best|top|good|great|favou?rite|options?|suggestions?|recommendations?|ideas?|places?|spots?|restaurants?|cafes?|bars?|hotels?|choices?|picks?)";
const asNumber = (text: string) => (/^\d$/.test(text) ? Number(text) : WORDS[text.toLowerCase()]);

/** How many results were asked for when it is a handful ("just give me 3", "top 5", "two options"); null otherwise. */
export function askedCount(message: string): number | null {
  const patterns = [
    new RegExp(`\\b(?:just|only)\\s+(?:give\\s+me\\s+|show\\s+me\\s+|need\\s+|want\\s+)?${COUNT}\\b(?!\\s*(?:days?|nights?|people|adults|kids|children|of us))`, "i"),
    new RegExp(`\\btop\\s+${COUNT}\\b`, "i"),
    new RegExp(`\\b${COUNT}\\s+(?:\\w+\\s+){0,2}?${THINGS}\\b`, "i"),
  ];
  for (const pattern of patterns) {
    const found = message.match(pattern)?.[1];
    const n = found ? asNumber(found) : undefined;
    if (n && n >= 1 && n <= 5) return n;
  }
  return null;
}

/** A nightly price ceiling and a star floor from the message: "under $150 a night", "max 200 per night", "4 stars or better". */
export function stayLimits(message: string): { priceMax: number | null; minStars: number | null } {
  const price = message.match(/\b(?:under|below|less\s+than|up\s+to|max(?:imum)?(?:\s+of)?|(?:no|nothing)\s+more\s+than|at\s+most|within|cheaper\s+than)\s*[$€£]?\s?(\d{2,5})\s*(?:cad|usd|eur|gbp|dollars?|euros?|pounds?)?\s*(?:a|per|\/|each)\s*night/i)
    ?? message.match(/[$€£]?\s?(\d{2,5})\s*(?:cad|usd|eur|gbp)?\s*(?:a|per|\/)\s*night\s*(?:or\s+less|max(?:imum)?|tops|at\s+most)/i);
  const stars = message.match(/\b(\d|three|four|five)[\s-]*stars?\b(?:\s+(?:or\s+(?:better|above|more)|and\s+(?:up|above)|plus|\+))?/i);
  const starCount = stars ? asNumber(stars[1]) : undefined;
  return { priceMax: price ? Number(price[1]) : null, minStars: starCount && starCount >= 3 && starCount <= 5 ? starCount : null };
}
