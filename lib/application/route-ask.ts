import { readDates, readParty, withoutDates } from "./stay-ask";

export type RouteMode = "flight" | "train" | "bus" | "transit" | "drive" | "walk" | "ferry";
/** A place the sentence points at without naming it: where you are, your hotel, home. The screen knows what they mean. */
type RouteSpecial = "here" | "stay" | "home";

export type RouteAsk = {
  from?: string;
  to?: string;
  fromSpecial?: RouteSpecial;
  toSpecial?: RouteSpecial;
  modes?: RouteMode[];
  /** The day to leave, and for a return flight the day back. */
  date?: string;
  returnDate?: string;
  time?: { kind: "depart" | "arrive"; time: string };
  travellers?: number;
  /** A sentence with more legs than one ("Toronto to Montreal to Ottawa"): only the first is used, and the rest is said. */
  more?: string;
};

const rx = (source: string, flags = "i") => new RegExp(source, flags);

const MODES: Array<[RouteMode, string, boolean]> = [
  // [mode, words, safeBare]: a word that can also be part of a place ("bus station") only counts with a "by" before it, or at an edge of the sentence.
  ["flight", "flights?|flying|fly|airfare|plane|airplane", true],
  ["flight", "air", false],
  ["train", "trains?|rail|railway|amtrak|eurostar", false],
  ["bus", "buses|bus|coach|greyhound|flixbus", false],
  ["drive", "driving|drive|car|road\\s*trip|roadtrip|by road", false],
  ["walk", "walking|walk|on foot", false],
  ["ferry", "ferry|boat", false],
  ["transit", "public\\s+transport(?:ation)?|transit|metro|subway|tube|tram|underground", false],
];

const FILLER = new Set(("you find show get give search look looking lookup plan book check me us a an some any my our please pls hey hi hello can could would will should i we id i'd i'm want wanted need like to go going take " +
  "cheap cheapest fast fastest quick quickest best easy easiest way ways route routes trip trips option options directions direction journey travel travelling traveling how do does what whats what's is are the there from").split(" "));
const TRAILING = new Set("please pls thanks thank you thx asap now ok okay by via using with on in at for".split(" "));

/** Places whose name really starts with "the". */
const THE_PLACES = /^(?:hague|netherlands|bahamas|gambia|philippines|maldives|gulf|alps|algarve|hamptons|cotswolds|bronx|valley)\b/i;
const NOT_PLACES = /^(?:around|anywhere|somewhere|there|it|that|this|nearby|around here|stuff|something|things?|cheap|cheapest|fastest|best|way|ways|route|routes|trip|directions?)$/i;
const SPECIAL_HERE = /^(?:here|my location|current location|my current location|where i am|near me|my position)$/i;
const SPECIAL_STAY = /^(?:my (?:stay|hotel|accommodation|airbnb|room)|the hotel|our hotel|hotel|my lodging)$/i;
const SPECIAL_HOME = /^(?:home|my home|my place|back home)$/i;
const special = (place: string): RouteSpecial | undefined => (SPECIAL_HERE.test(place) ? "here" : SPECIAL_STAY.test(place) ? "stay" : SPECIAL_HOME.test(place) ? "home" : undefined);

const SMALL = new Set("of de del della di da du la le les los las el al the and in on upon sur sous en y".split(" "));
/** "montreal" -> "Montreal", "salt lake city" -> "Salt Lake City", "rio de janeiro" -> "Rio de Janeiro"; what already has capitals is kept. */
function tidy(place: string): string {
  return place
    .replace(/["“”‘’`]+/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w, i) => (/[A-Z]/.test(w) ? w : SMALL.has(w.toLowerCase()) && i > 0 ? w.toLowerCase() : w.replace(/^(\p{L})/u, (c) => c.toUpperCase()).replace(/(-)(\p{L})/gu, (_, d: string, c: string) => d + c.toUpperCase())))
    .join(" ");
}

/** Strip the scaffolding off a place phrase: "find me the cheapest way toronto" -> "toronto"; "montreal please" -> "montreal". */
function clean(segment: string): string {
  const words = segment.replace(/["“”]/g, "").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && FILLER.has(words[0]!.toLowerCase().replace(/[.,]/g, "")) && !(words[0]!.toLowerCase() === "the" && THE_PLACES.test(words.slice(1).join(" ")))) words.shift();
  while (words.length > 1 && TRAILING.has(words[words.length - 1]!.toLowerCase().replace(/[.,!?]/g, ""))) words.pop();
  return tidy(words.join(" "));
}

/** A time said plainly: "at 5pm", "leaving 17:30", "arrive by 9:15am", "at noon". Never a bare number, which may be anything. */
function readTime(text: string): { time?: { kind: "depart" | "arrive"; time: string }; rest: string } {
  const clock = "(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?|(\\d{1,2}):(\\d{2})|(noon|midnight)";
  const m = text.match(rx(`(?:\\b(arriv(?:e|ing|al)|get\\s+there|be\\s+there|by|before)\\s+(?:at\\s+)?|\\b(?:leav(?:e|ing)|depart(?:ing)?|start(?:ing)?|go|at|around|after)\\s+)?(?:${clock})\\b`));
  if (!m) return { rest: text };
  const arrive = Boolean(m[1]);
  let hh: number; let mm = 0;
  if (m[8]) { hh = /noon/i.test(m[8]) ? 12 : 0; }
  else if (m[6]) { hh = Number(m[5]); mm = Number(m[6]); if (m[7]) {/* unreachable */} }
  else { hh = Number(m[2]); mm = Number(m[3] ?? 0); const pm = /p/i.test(m[4]!); hh = (hh % 12) + (pm ? 12 : 0); }
  if (hh > 23 || mm > 59) return { rest: text };
  return { time: { kind: arrive ? "arrive" : "depart", time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` }, rest: text.replace(m[0], " ") };
}

/** True when everything before a word is scaffolding ("can you find me a ..."), so the word is the way of travelling and not the end of a place's name. */
const onlyFiller = (prefix: string) => prefix.trim().split(/\s+/).filter(Boolean).every((w) => FILLER.has(w.toLowerCase().replace(/[.,]/g, "")));

function readModes(text: string): { modes: RouteMode[]; rest: string } {
  const modes: RouteMode[] = [];
  let rest = text;
  for (const [mode, words, safeBare] of MODES) {
    const by = rx(`\\b(?:by|via|using|take|taking|on|on\\s+the|take\\s+the|with)\\s+(?:a\\s+|the\\s+)?(?:${words})\\b`, "i");
    // "Rodeo Drive to Santa Monica", "Bel Air to Venice": a mode word that follows part of a name is part of that name.
    const edge = rx(`\\b(?:${words})\\b(?=\\s+(?:from|to|between|towards)\\b|\\s*[.,!?]?\\s*$)`, "i");
    const lead = rx(`\\b(?:find|show|search|get|book|any|cheap(?:est)?|fast(?:est)?|best)\\s+(?:me\\s+)?(?:\\w+\\s+)?(?:${words})\\b`, "i");
    const bare = rx(`\\b(?:${words})\\b`, "i");
    const found = safeBare ? bare.exec(rest) : by.exec(rest) ?? [edge.exec(rest), lead.exec(rest)].find((m) => m && onlyFiller(rest.slice(0, m.index))) ?? null;
    if (!found) continue;
    if (!modes.includes(mode)) modes.push(mode);
    rest = `${rest.slice(0, found.index)} ${rest.slice(found.index + found[0].length)}`;
  }
  return { modes, rest };
}

/**
 * A traveller's sentence about getting somewhere, read in code so it is instant and exact: the two ends however they are said ("Toronto to
 * Montreal", "from X to Y", "X → Y", "Y from X", "to Lisbon", just "Lisbon"), the way of travelling ("flights", "by train"), the day and the
 * day back, a time, and the party. A phrase the sentence only points at ("here", "my hotel", "home") is left for the screen to fill. Anything it
 * cannot find two ends or one end in comes back empty, and the model is asked.
 */
export function readRouteAsk(query: string, today: string): RouteAsk {
  const out: RouteAsk = {};
  let text = query.replace(/\s+/g, " ").trim();
  if (!text) return out;

  const dates = readDates(text, today);
  if (dates.checkin) out.date = dates.checkin;
  if (dates.checkout) out.returnDate = dates.checkout;
  text = withoutDates(text).replace(/\b(?:tonight|today|tomorrow|(?:this|next|the coming)\s+weekend|next\s+week)\b/gi, " ");
  // What a date leaves behind: "... to montreal from" once "dec 1-14" is gone.
  text = text.replace(/\s+(?:from|on|between|for|during|in|starting|leaving|departing|returning|and)\s*$/i, "");

  const t = readTime(text);
  if (t.time) out.time = t.time;
  text = t.rest;

  const party = readParty(text);
  if (party.adults !== undefined) {
    out.travellers = party.adults;
    text = text.replace(rx("\\b(?:(?:\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\\s*(?:adults?|guests?|people|persons?|travell?ers|pax|of\\s+us|ppl)|(?:party|group|family|couple)\\s+of\\s+\\w+|for\\s+(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?!\\s*(?:nights?|days?|weeks?)))\\b", "gi"), " ").replace(/\b(?:solo|alone|just me|myself|a couple)\b/gi, " ");
  }

  const m = readModes(text);
  if (m.modes.length) out.modes = m.modes;
  text = m.rest.replace(/\s+/g, " ").trim().replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "");
  if (!text) return out;

  let a: string | undefined;
  let b: string | undefined;
  let hit: RegExpMatchArray | null;
  if ((hit = text.match(rx("\\bfrom\\s+(.+?)\\s+(?:to|towards|into|->|→)\\s+(.+)$")))) [a, b] = [hit[1], hit[2]];
  else if ((hit = text.match(rx("\\bbetween\\s+(.+?)\\s+and\\s+(.+)$")))) [a, b] = [hit[1], hit[2]];
  else if ((hit = text.match(/^(.+?)\s*(?:→|->|=>|➔|➜)\s*(.+)$/))) [a, b] = [hit[1], hit[2]];
  else if ((hit = text.match(/^(.+?)\s+[–—-]\s+(.+)$/))) [a, b] = [hit[1], hit[2]];
  else if ((hit = text.match(rx("\\bto\\s+(.+?)\\s+from\\s+(.+)$")))) [b, a] = [hit[1], hit[2]];
  else if ((hit = text.match(rx("^(.+?)\\s+(?:to|towards)\\s+(.+)$")))) [a, b] = [hit[1], hit[2]];
  else if ((hit = text.match(rx("^(.+?)\\s+from\\s+(.+)$")))) [b, a] = [hit[1], hit[2]];
  else if ((hit = text.match(rx("\\bfrom\\s+(.+)$")))) a = hit[1];
  else if ((hit = text.match(rx("(?:^|\\s)(?:to|towards|toward|into)\\s+(.+)$")))) b = hit[1];
  else b = text; // one place on its own: where to

  if (b && /\s(?:to|then|and then)\s/i.test(b) && a) {
    const split = b.split(/\s+(?:to|then|and then)\s+/i);
    b = split[0];
    out.more = clean(split.slice(1).join(" to "));
  }
  let unplaced = false;
  for (const [segment, key] of [[a, "from"], [b, "to"]] as const) {
    if (!segment) continue;
    // A whole sentence, or a word that is not a place ("how do I get around"), is left to the model.
    const place = segment.trim().split(/\s+/).length > 6 ? "" : clean(segment);
    if (!place || place.length < 2 || NOT_PLACES.test(place)) { unplaced = true; continue; }
    const s = special(place.toLowerCase());
    if (s) out[key === "from" ? "fromSpecial" : "toSpecial"] = s;
    else out[key] = place;
  }
  // One end that is no place at all means the sentence is something else: leave it all to the model.
  if (unplaced) { delete out.from; delete out.to; delete out.fromSpecial; delete out.toSpecial; }
  // Two dates are a day out and a day back only for a flight; for any other way the second is not a return.
  if (out.returnDate && !(out.modes ?? []).includes("flight")) delete out.returnDate;
  return out;
}

/** Nothing in the sentence could be taken for a place: the model is asked. */
export const routeAskIsEmpty = (a: RouteAsk): boolean => !a.from && !a.to && !a.fromSpecial && !a.toSpecial;

export type RouteContext = {
  /** What the From and To fields already hold. */
  from: string;
  to: string;
  /** The trip's own home city, for "home to Lisbon". */
  home: string;
  /** The hotel the group has locked in, for "my hotel to the airport". */
  stay?: string;
};

export type RoutePlan =
  /** Both ends are known: search. */
  | { kind: "go"; from: string; to: string }
  /** One end is missing: ask for it in the same box. `keep` is the end that is known. */
  | { kind: "ask"; need: "from" | "to"; keep: string }
  /** An end names somewhere too big to route to (a country, a region): ask which city in it. */
  | { kind: "city"; side: "from" | "to"; place: string; options: string[]; keep: string }
  | { kind: "same"; place: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What to do with what was said: search when both ends are known (the screen's own fields fill an end the sentence leaves out), ask for the
 * one that is missing, ask "which city?" when an end is a whole country, and refuse a trip from a place to itself.
 */
export function planRoute(a: RouteAsk, ctx: RouteContext, isBroad: (place: string) => boolean, areasFor: (place: string) => string[]): RoutePlan {
  const known = (special: RouteSpecial | undefined) => (special === "home" ? ctx.home : special === "stay" ? ctx.stay ?? "" : "");
  const said = { from: a.from ?? known(a.fromSpecial), to: a.to ?? known(a.toSpecial) };
  // An end the sentence does not mention at all stays as the screen has it; one it points at ("here", "my hotel") is not known, so it is asked.
  const from = said.from || (a.fromSpecial ? "" : ctx.from.trim());
  const to = said.to || (a.toSpecial ? "" : ctx.to.trim());
  for (const [side, place, spoken] of [["from", from, Boolean(a.from)], ["to", to, Boolean(a.to)]] as const) {
    if (spoken && place && isBroad(place)) return { kind: "city", side, place, options: areasFor(place), keep: side === "from" ? to : from };
  }
  if (!from) return { kind: "ask", need: "from", keep: to };
  if (!to) return { kind: "ask", need: "to", keep: from };
  if (norm(from) === norm(to)) return { kind: "same", place: from };
  return { kind: "go", from, to };
}

/** The ways the search knows: flights, driving, and everything on rails, roads and water that runs to a timetable. */
export const searchModes = (modes: RouteMode[] | undefined): string[] => [...new Set((modes ?? []).map((m) => (m === "flight" ? "flight" : m === "drive" ? "drive" : "transit")))];
