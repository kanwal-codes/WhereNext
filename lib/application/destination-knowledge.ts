import data from "@/data/knowledge/destinations.json";

type Fact = { topic: string; text: string; site: string; url: string; checked: string };
type Destination = { name: string; aliases: string[]; facts: Fact[] };
type Source = { title: string; url: string; content: string };

const TOPICS: Array<[string, RegExp]> = [
  ["tipping", /\btip(s|ping)?\b|gratuity/],
  ["water", /tap water|drinking water|drink the water|safe to drink|bottled water/],
  ["plugs", /\bplugs?\b|adapt[eo]r|voltage|socket|outlet/],
  ["airport", /airport.*(city|centre|center|downtown|metro|transfer|transport|train)|from the airport|to the airport/],
  ["season", /best (time|month|season)|when to (go|visit)|rainy season|climate|monsoon|high season/],
  ["money", /\bcash\b|\bcards?\b|\batms?\b/],
];
// Anything that moves or depends on who is asking is never answered from the saved facts: the live search still runs.
const VOLATILE = /\b(visa|visas|entry|price|prices|cost|costs|fare|fares|open|opening|hours|ticket|tickets|advisory|news|strike|event|events|today|tonight|now|current|currently|202\d)\b|this (week|weekend)/;

/**
 * Saved, sourced facts for a stable question about a destination we have read up on ("tipping in Lisbon"), as the same
 * source objects a web search returns, so the reply can state the fact and link its page. Null means "search the web".
 */
export function knownAnswer(query: string): Source[] | null {
  const q = query.toLowerCase();
  if (VOLATILE.test(q)) return null;
  const place = (data.destinations as Destination[]).find((d) => d.aliases.some((a) => q.includes(a)));
  if (!place) return null;
  const topics = TOPICS.filter(([, re]) => re.test(q)).map(([t]) => t);
  const facts = place.facts.filter((f) => topics.includes(f.topic));
  // Every topic asked must be covered, or the web search answers the part we cannot.
  if (!topics.length || facts.length < topics.length) return null;
  return facts.map((f) => ({ title: `${place.name}: ${f.topic} (${f.site})`, url: f.url, content: `${f.text} (Read ${f.checked}.)` }));
}
