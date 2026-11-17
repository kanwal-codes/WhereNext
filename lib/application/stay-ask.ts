import { readStayPrice } from "./constraints";

type StaySortAsk = "price" | "price_desc" | "rating" | "stars";
export type StayAsk = {
  priceMin?: number; priceMax?: number;
  checkin?: string; checkout?: string; nights?: number;
  sort?: StaySortAsk; stars?: number[]; refundable?: boolean; adults?: number; rooms?: number;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])";
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const TO = "\\s*(?:-|–|—|to|until|till|through|thru|and)\\s*";
const NUMWORD: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const COUNT = "(\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)";
const count = (t: string) => (/^\d+$/.test(t) ? Number(t) : NUMWORD[t.toLowerCase()]!);
const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());
const rx = (source: string, flags = "i") => new RegExp(source, flags);

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const real = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m, d)); return t.getUTCMonth() === m && t.getUTCDate() === d; };
const parseIso = (s: string): [number, number, number] => { const [y, m, d] = s.split("-").map(Number) as [number, number, number]; return [y, m - 1, d]; };
export const addDaysIso = (day: string, n: number) => { const [y, m, d] = parseIso(day); const t = new Date(Date.UTC(y, m, d + n)); return iso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };

type Day = { m: number; d: number } | { iso: string };

/** Every date the sentence names, in the order it names them: "10 dec", "december 10th", "the 10th of dec", "dec10", "2026-12-10", and a day or two sharing a month ("dec 10-14", "10-14 dec"). */
function datesIn(text: string): { days: Day[]; spans: Array<[number, number]> } {
  const out: { at: number; days: Day[] }[] = [];
  const claim = (m: RegExpExecArray, days: Day[]) => out.push({ at: m.index, days });
  const used: Array<[number, number]> = [];
  const free = (m: RegExpExecArray) => !used.some(([a, b]) => m.index < b && m.index + m[0].length > a);
  const take = (re: RegExp, make: (m: RegExpExecArray) => Day[]) => {
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
      if (!free(m as RegExpExecArray)) continue;
      used.push([m.index!, m.index! + m[0].length]);
      claim(m as RegExpExecArray, make(m as RegExpExecArray));
    }
  };
  // Two days that share a month, written once.
  take(rx(`\\b${DAY}\\s*(?:-|–|—|to|until|till|through|thru)\\s*(?:the\\s+)?${DAY}\\s*(?:of\\s+)?${MONTH}`), (m) => [{ m: month(m[3]!), d: Number(m[1]) }, { m: month(m[3]!), d: Number(m[2]) }]);
  take(rx(`\\b${MONTH}\\.?\\s*(?:the\\s+)?${DAY}\\s*(?:-|–|—|to|until|till|through|thru)\\s*(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:${MONTH}|nights?|days?|guests?|people|adults?|stars?|\\$|€|£|dollars?))`), (m) => [{ m: month(m[1]!), d: Number(m[2]) }, { m: month(m[1]!), d: Number(m[3]) }]);
  take(rx("\\b(\\d{4}-\\d{2}-\\d{2})\\b"), (m) => [{ iso: m[1]! }]);
  take(rx(`\\b(?:the\\s+)?${DAY}\\s*(?:of\\s+)?${MONTH}\\.?`), (m) => [{ m: month(m[2]!), d: Number(m[1]) }]);
  take(rx(`\\b${MONTH}\\.?\\s*(?:the\\s+)?${DAY}\\b`), (m) => [{ m: month(m[1]!), d: Number(m[2]) }]);
  return { days: out.sort((a, b) => a.at - b.at).flatMap((o) => o.days), spans: used };
}

/** The sentence with its dates taken out, so a day is never read as a price or a count. */
export const withoutDates = (text: string) => { const { spans } = datesIn(text); return [...spans].sort((a, b) => b[0] - a[0]).reduce((t, [a, b]) => `${t.slice(0, a)} ${t.slice(b)}`, text); };

/** The next time this month and day comes (today counts), as a year. */
const yearFor = (m: number, d: number, today: [number, number, number]) => (m > today[1] || (m === today[1] && d >= today[2]) ? today[0] : today[0] + 1);

function stayLength(text: string): number | null {
  // "4 nights", "for a night"; but not the "a night" of a price ("100 a night", "$100 per night").
  for (const m of text.matchAll(rx(`\\b${COUNT}[\\s-]*nights?\\b`, "gi"))) {
    const before = text.slice(0, m.index);
    const ofAPrice = /[\d$€£]\s*(?:cad|usd|eur|gbp|dollars?|euros?|pounds?|bucks|quid)?\s*$/i.test(before) || /\bper\s*$/i.test(before);
    const loneA = /^(?:a|an)$/i.test(m[1]!) && !/\b(?:for|just|only|one|spend|spending|stay|staying|overnight)\s*$/i.test(before);
    if (!ofAPrice && !loneA) return count(m[1]!);
  }
  if (/\b(?:a|one|1)[\s-]*week\b/i.test(text)) return 7;
  const weeks = text.match(rx(`\\b${COUNT}[\\s-]*weeks?\\b`));
  if (weeks) return count(weeks[1]!) * 7;
  if (/\bweekend\b/i.test(text)) return 2;
  if (/\bfortnight\b/i.test(text)) return 14;
  return null;
}

export function readDates(text: string, today: string): Pick<StayAsk, "checkin" | "checkout" | "nights"> {
  const t0 = parseIso(today);
  const nights = stayLength(text);
  const days = datesIn(text).days;
  const resolve = (d: Day, after?: string): string | null => {
    if ("iso" in d) return /^\d{4}-\d{2}-\d{2}$/.test(d.iso) && real(...parseIso(d.iso)) ? d.iso : null;
    let y = yearFor(d.m, d.d, t0);
    if (after) { const [ay, am, ad] = parseIso(after); y = d.m > am || (d.m === am && d.d > ad) ? ay : ay + 1; }
    return real(y, d.m, d.d) ? iso(y, d.m, d.d) : null;
  };
  if (days.length >= 2) {
    const a = resolve(days[0]!);
    const b = a ? resolve(days[1]!, a) : null;
    if (a && b && b > a && (Date.parse(b) - Date.parse(a)) / 864e5 <= 60) return { checkin: a, checkout: b };
    if (a) return nights ? { checkin: a, nights } : { checkin: a };
    return {};
  }
  if (days.length === 1) {
    const a = resolve(days[0]!);
    if (!a) return {};
    return nights ? { checkin: a, nights } : { checkin: a };
  }
  // No calendar date: tonight, tomorrow, this or next weekend.
  const dow = new Date(Date.UTC(t0[0], t0[1], t0[2])).getUTCDay();
  const todayIso = today;
  if (/\btonight\b|\btoday\b/i.test(text)) return { checkin: todayIso, nights: nights ?? 1 };
  if (/\btomorrow\b/i.test(text)) return { checkin: addDaysIso(todayIso, 1), ...(nights ? { nights } : {}) };
  const weekend = text.match(/\b(this|next|the coming)\s+weekend\b/i);
  if (weekend) {
    const friday = dow === 6 ? todayIso : dow === 0 ? todayIso : addDaysIso(todayIso, (5 - dow + 7) % 7);
    const checkin = /next/i.test(weekend[1]!) ? addDaysIso(friday, 7) : friday;
    return { checkin, nights: 2 };
  }
  return nights ? { nights } : {};
}

function readStars(text: string): number[] | undefined {
  const N = "([2-5]|two|three|four|five)";
  const STAR = "[\\s-]*(?:stars?|\\*+|★)";
  const num = (t: string) => count(t);
  const below = text.match(rx(`\\b(?:under|below|less\\s+than|fewer\\s+than)\\s*${N}${STAR}`));
  if (below) { const hi = num(below[1]!) - 1; return hi >= 1 ? Array.from({ length: hi }, (_, i) => i + 1) : undefined; }
  const range = text.match(rx(`\\b${N}\\s*(?:-|–|to|or|and)\\s*${N}${STAR}`));
  if (range) { const [lo, hi] = [num(range[1]!), num(range[2]!)].sort(); return Array.from({ length: hi! - lo! + 1 }, (_, i) => lo! + i); }
  const floor = text.match(rx(`\\b(?:at\\s+least|minimum(?:\\s+of)?|min|no\\s+less\\s+than|over|above)\\s*${N}${STAR}`))
    ?? text.match(rx(`\\b${N}\\s*\\+?${STAR}\\s*(?:\\+|plus|minimum|or\\s+(?:better|above|more|higher)|and\\s+(?:up|above|better))`))
    ?? text.match(rx(`\\b${N}\\+\\s*(?:stars?|\\*+|★)`));
  if (floor) { const n = num(floor[1]!); return Array.from({ length: 6 - n }, (_, i) => n + i); }
  const one = text.match(rx(`\\b${N}${STAR}`));
  return one ? [num(one[1]!)] : undefined;
}

function readSort(text: string): StaySortAsk | undefined {
  if (/\b(?:high(?:est)?\s*(?:price\s*)?to\s*low(?:est)?|most\s+expensive(?:\s+first)?|highest\s+price(?:d)?(?:\s+first)?|priciest|dearest|price\s*(?:descending|desc|high\s*to\s*low)|luxury\s+first)\b/i.test(text)) return "price_desc";
  if (/\b(?:low(?:est)?\s*(?:price\s*)?to\s*high(?:est)?|cheapest(?:\s+first)?|cheapest\s+to|lowest\s*(?:price|first)|least\s+expensive|price\s*(?:ascending|asc|low\s*to\s*high)|ascending|sort(?:ed)?\s+by\s+price|by\s+price)\b/i.test(text)) return "price";
  if (/\b(?:(?:best|top|highest)[\s-]*(?:rated|reviewed|rating|ranked)|best\s+reviews?|by\s+(?:guest\s+)?(?:rating|reviews?)|most\s+popular|highest\s+score)\b/i.test(text)) return "rating";
  if (/\b(?:by\s+stars?|most\s+stars|star\s+rating\s+first|highest\s+stars?)\b/i.test(text)) return "stars";
  return undefined;
}

export function readParty(text: string): { adults?: number; rooms?: number } {
  const out: { adults?: number; rooms?: number } = {};
  const people = text.match(rx(`\\b${COUNT}\\s*(?:adults?|guests?|people|persons?|travell?ers|pax|of\\s+us|ppl)\\b`))
    ?? text.match(rx(`\\b(?:party|group|family|couple)\\s+of\\s+${COUNT}\\b`))
    ?? text.match(rx(`\\bfor\\s+${COUNT}\\b(?!\\s*(?:nights?|days?|weeks?|stars?|bucks|dollars?|euros?|pounds?|%|\\d|${MONTH}|k\\b))`));
  if (people) {
    const n = count(people[1]!);
    // "a guest", "one night" are not a party; a number of guests is from one to sixteen.
    if (n >= 1 && n <= 16 && !/^(?:a|an)$/i.test(people[1]!)) out.adults = n;
  }
  if (out.adults === undefined) {
    if (/\b(?:solo|alone|by\s+myself|just\s+me|only\s+me|myself)\b/i.test(text)) out.adults = 1;
    else if (/\b(?:couple|me\s+and\s+my\s+(?:wife|husband|partner|girlfriend|boyfriend|friend|mum|mom|dad|sister|brother)|the\s+two\s+of\s+us|both\s+of\s+us)\b/i.test(text)) out.adults = 2;
  }
  const rooms = text.match(rx(`\\b${COUNT}\\s*(?:bed)?rooms?\\b`));
  if (rooms) { const n = count(rooms[1]!); if (n >= 2 && n <= 8) out.rooms = n; }
  return out;
}

/**
 * What a traveller's own words fix about a hotel search, read in code so it is exact and instant whatever the model makes of the sentence:
 * the nightly price range, the dates (or a start and a number of nights), the order, the stars, free cancellation and the party. Each
 * is read only when the sentence says it plainly; anything else is left to the model. A date with no year is the next one that has not passed.
 */
export function readStayAsk(query: string, today: string): StayAsk {
  const text = query.replace(/\s+/g, " ").trim();
  const out: StayAsk = {};
  const rest = withoutDates(text);
  const sort = readSort(rest);
  if (sort) out.sort = sort;
  const stars = readStars(rest);
  if (stars?.length) out.stars = stars;
  if (/\b(?:free\s+cancell?(?:ation)?|fully\s+refundable|refundable|cancell?able|cancel\s+(?:for\s+)?free|free\s+to\s+cancel|flexible\s+(?:booking|cancell?ation|rate))\b/i.test(rest)) out.refundable = true;
  Object.assign(out, readParty(rest));
  const { priceMin, priceMax } = readStayPrice(rest, { bare: true });
  if (priceMin !== null) out.priceMin = priceMin;
  if (priceMax !== null) out.priceMax = priceMax;
  Object.assign(out, readDates(text, today));
  return out;
}

// Words that carry no search of their own: the ask's scaffolding, the units of its numbers, and the words the reader above already turned into a filter.
const SCAFFOLD = new Set(("give me find show get want need looking look for hotel hotels stay stays staying place places room rooms accommodation accommodations options option some any all please pls thanks " +
  "from to until till through thru between and the a an in of at on with it its is are i we us our my can you could would should will do does just only also then than that this these those about " +
  "night nights per week weeks weekend fortnight today tonight tomorrow next coming this checkin checkout check arriving arrive leaving leave departing depart " +
  "price prices priced pricing cost costs budget range rate rates sort sorted sorting order ordered by low lowest high highest cheap cheapest first last ascending descending asc desc expensive priciest dearest least most popular luxury " +
  "best top rated rating ratings reviewed reviews review ranked score star stars better above up plus minimum maximum min max at least more less over under below within limit tops no nothing not exceeding " +
  "free cancellation cancel cancelable cancellable refundable fully flexible booking adults adult guests guest people persons person travellers travelers pax ppl party group family couple solo alone myself " +
  "dollars dollar usd cad eur euros euro pounds gbp bucks quid around approximately roughly circa approx k them dollar's").split(" "));
const MONTH_WORD = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/;
const NUM_WORD = new Set(Object.keys(NUMWORD));

/**
 * True when the sentence says something this reader has no meaning for ("near the old town", "with a pool", "in Lisbon"): then the model is asked.
 * A sentence made only of dates, prices, an order, stars, guests and free cancellation is fully read here, and nothing waits on a model at all.
 */
export function stayAskNeedsModel(query: string): boolean {
  return query.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]s\b/g, "").split(/[^a-z0-9$€£*★+]+/).filter(Boolean).some((w) => {
    const bare = w.replace(/[$€£*★+]/g, "");
    if (!bare || /\d/.test(bare)) return false;
    return !SCAFFOLD.has(bare) && !MONTH_WORD.test(bare) && !NUM_WORD.has(bare);
  });
}
