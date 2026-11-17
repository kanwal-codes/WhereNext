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

const SYM = "[$€£]";
const CUR = "(?:cad|usd|eur|gbp|dollars?|euros?|pounds?|bucks|quid)";
const NUM = "(\\d{1,3}(?:,\\d{3})+|\\d{2,5})";
const MONTH_AFTER = "(?!\\s*(?:st|nd|rd|th)\\b)(?!\\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\b)";
const NOT_UNIT = "(?!\\s*(?:days?|nights?|stars?|guests?|people|persons?|adults?|rooms?|kms?|miles?|mi|minutes?|mins?|hours?|hrs?|meters?|metres?|reviews?|%)\\b)";
const amount = (text: string) => Number(text.replace(/,/g, ""));
const rx = (source: string) => new RegExp(source, "i");

/**
 * A nightly price ceiling and floor, from however the traveller put it: "between 100 and 200", "100-200", "price 150-200", "$100–$200",
 * "under 150", "no more than 150 a night", "over 100", "at least $90", "around 150", "150 a night". A number counts as money only
 * with a word or sign that says so (or after "between"), never when it is a date, a star count or a number of guests.
 */
export function readStayPrice(message: string, opts: { bare?: boolean } = {}): { priceMin: number | null; priceMax: number | null } {
  const text = message.replace(/\s+/g, " ");
  // A total for the whole trip is not a price for a night.
  if (/\b(?:total|overall|altogether|in all)\b/i.test(text) && !/\b(?:a|per|\/|each)\s*night\b|\bnightly\b/i.test(text)) return { priceMin: null, priceMax: null };
  const both = (m: RegExpMatchArray | null): [number, number] | null => (m ? ([amount(m[1]!), amount(m[2]!)].sort((a, b) => a - b) as [number, number]) : null);
  const range =
    both(text.match(rx(`\\bbetween\\s*${SYM}?\\s?${NUM}\\s*(?:${CUR}\\s*)?(?:and|to|-|–|—)\\s*${SYM}?\\s?${NUM}${NOT_UNIT}`)))
    ?? both(text.match(rx(`\\b(?:price|priced|prices|pricing|budget|rate|rates|cost|costs)\\s*(?:range\\s*)?(?:of|is|from|around|between|:)?\\s*${SYM}?\\s?${NUM}\\s*(?:to|and|-|–|—)\\s*${SYM}?\\s?${NUM}${NOT_UNIT}`)))
    ?? both(text.match(rx(`\\bfrom\\s*${SYM}\\s?${NUM}\\s*(?:to|and|-|–|—)\\s*${SYM}?\\s?${NUM}`)))
    ?? both(text.match(rx(`${SYM}\\s?${NUM}\\s*(?:to|-|–|—)\\s*${SYM}?\\s?${NUM}`)))
    ?? both(text.match(rx(`\\b${NUM}\\s*(?:to|-|–|—)\\s*${NUM}\\s*(?:${CUR}\\b|(?:a|per|\\/)\\s*night)`)))
    // A bare pair of amounts ("150-200") is a price only where the caller has already taken the dates out of the sentence.
    ?? (opts.bare ? both(text.match(rx(`\\b${NUM}\\s*(?:to|-|–|—)\\s*${NUM}\\b${MONTH_AFTER}${NOT_UNIT}`))) : null);
  if (range && range[0] >= 20) return { priceMin: range[0], priceMax: range[1] };

  const one = (source: string): number | null => {
    const m = text.match(rx(source));
    const n = m ? amount(m[1]!) : null;
    return n !== null && n >= 20 ? n : null;
  };
  let priceMax =
    one(`\\b(?:under|below|(?<!\\b(?:no|not)\\s)less\\s+than|(?:nothing|not|no)\\s+(?:over|above|higher\\s+than)|up\\s+to|at\\s+most|(?:no|nothing)\\s+more\\s+than|not\\s+(?:more|over|above)\\s+than|cheaper\\s+than|no\\s+(?:higher|over)\\s+than|not\\s+exceeding|max(?:imum)?(?:\\s+price)?(?:\\s+of)?|within|limit(?:\\s+of)?|budget(?:\\s+of)?)\\s*:?\\s*${SYM}?\\s?${NUM}${MONTH_AFTER}${NOT_UNIT}`)
    ?? one(`${SYM}?\\s?${NUM}\\s*(?:${CUR}\\s*)?(?:(?:a|per|\\/)\\s*night\\s*)?(?:or\\s+(?:less|under|below|cheaper)|max(?:imum)?|tops|at\\s+most)\\b`);
  let priceMin = one(`\\b(?:(?<!\\b(?:nothing|not|no|never)\\s)(?:over|above)|(?<!\\b(?:nothing|not|no)\\s)more\\s+than|at\\s+least|minimum(?:\\s+of)?|min|starting\\s+(?:at|from)|from|upwards?\\s+of|no\\s+less\\s+than|not\\s+less\\s+than)\\s*${SYM}?\\s?${NUM}${MONTH_AFTER}${NOT_UNIT}`)
    ?? one(`${SYM}?\\s?${NUM}\\s*(?:${CUR}\\s*)?(?:(?:a|per|\\/)\\s*night\\s*)?(?:or\\s+(?:more|over|above|higher)|minimum|and\\s+(?:up|above))\\b`);
  const around = one(`\\b(?:around|about|roughly|approximately|approx\\.?|circa|~)\\s*${SYM}?\\s?${NUM}${MONTH_AFTER}${NOT_UNIT}`);
  if (around !== null && priceMax === null && priceMin === null) { priceMin = Math.round((around * 0.8) / 5) * 5; priceMax = Math.round((around * 1.2) / 5) * 5; }
  // A bare amount with its unit ("150 a night", "$150", "price 150") is a ceiling.
  if (priceMax === null && priceMin === null) {
    priceMax = one(`${SYM}?\\s?${NUM}\\s*(?:${CUR}\\s*)?(?:a|per|\\/)\\s*night`) ?? one(`${SYM}\\s?${NUM}\\b`) ?? one(`\\b(?:price|prices|priced|pricing|budget|cost|rate)\\s*(?:of|is|:|around)?\\s*${SYM}?\\s?${NUM}${NOT_UNIT}`) ?? one(`\\b${NUM}\\s*${CUR}\\b`);
  }
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  return { priceMin, priceMax };
}

/** A nightly price range and a star floor from the message: "under $150 a night", "between 100-200", "4 stars or better". */
export function stayLimits(message: string): { priceMin: number | null; priceMax: number | null; minStars: number | null } {
  const { priceMin, priceMax } = readStayPrice(message);
  const stars = message.match(/\b(\d|three|four|five)[\s-]*stars?\b(?:\s+(?:or\s+(?:better|above|more)|and\s+(?:up|above)|plus|\+))?/i);
  const starCount = stars ? asNumber(stars[1]) : undefined;
  return { priceMin, priceMax, minStars: starCount && starCount >= 3 && starCount <= 5 ? starCount : null };
}
