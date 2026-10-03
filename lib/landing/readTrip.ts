/**
 * Reads a trip sentence the way the first-screen boarding pass shows it: who is going, when, how
 * much, what for, and where. Plain pattern matching, no model: it only fills in what the sentence
 * plainly says and leaves everything else undefined, so the pass never shows a guess. Roam does the
 * real understanding in the chat.
 */
export type TripRead = { people?: string; dates?: string; budget?: string; style?: string; place?: { code: string; name: string } };

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUM = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten";
const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const count = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()]);
const monthIndex = (s: string) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3).toLowerCase());

const CITIES: [string, string][] = [
  ["Montreal", "YUL"], ["Montréal", "YUL"], ["Toronto", "YYZ"], ["Vancouver", "YVR"], ["Quebec City", "YQB"], ["New York", "NYC"], ["Los Angeles", "LAX"], ["San Francisco", "SFO"],
  ["Chicago", "CHI"], ["Miami", "MIA"], ["Mexico City", "MEX"], ["Oaxaca", "OAX"], ["Havana", "HAV"], ["Buenos Aires", "BUE"], ["Lisbon", "LIS"], ["Porto", "OPO"], ["Madrid", "MAD"],
  ["Barcelona", "BCN"], ["Paris", "PAR"], ["London", "LON"], ["Edinburgh", "EDI"], ["Dublin", "DUB"], ["Amsterdam", "AMS"], ["Berlin", "BER"], ["Copenhagen", "CPH"], ["Rome", "ROM"],
  ["Florence", "FLR"], ["Venice", "VCE"], ["Vienna", "VIE"], ["Prague", "PRG"], ["Athens", "ATH"], ["Istanbul", "IST"], ["Reykjavik", "REK"], ["Marrakech", "RAK"], ["Cape Town", "CPT"],
  ["Dubai", "DXB"], ["Bangkok", "BKK"], ["Singapore", "SIN"], ["Hanoi", "HAN"], ["Bali", "DPS"], ["Seoul", "SEL"], ["Tokyo", "TYO"], ["Kyoto", "KYO"], ["Osaka", "OSA"], ["Sydney", "SYD"],
];

function people(t: string): string | undefined {
  const of = new RegExp(`\\b(${NUM})\\s+of\\s+us\\b`, "i").exec(t);
  if (of) return plural(count(of[1]));
  const withN = new RegExp(`\\b(?:with|and|plus)\\s+(${NUM})\\s+(?:friends?|others?|kids?|children|people)\\b`, "i").exec(t);
  if (withN) return plural(count(withN[1]) + 1);
  const n = new RegExp(`\\b(${NUM})\\s+(?:people|adults|travell?ers|guests|friends)\\b`, "i").exec(t);
  if (n) return plural(count(n[1]));
  const family = new RegExp(`\\bfamily of\\s+(${NUM})\\b`, "i").exec(t);
  if (family) return plural(count(family[1]));
  if (/\b(solo|by myself|just me|on my own)\b/i.test(t)) return "Just you";
  if (/\b(couple|anniversary|honeymoon|my (?:partner|wife|husband|girlfriend|boyfriend))\b/i.test(t)) return "2 people";
  return undefined;
}
const plural = (n: number) => (n === 1 ? "Just you" : `${n} people`);

function dates(t: string): string | undefined {
  const range = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})\\s*(?:-|–|—|to)\\s*(\\d{1,2})\\b`, "i").exec(t);
  if (range && monthIndex(range[1]) >= 0) return `${SHORT[monthIndex(range[1])]} ${range[2]}–${range[3]}`;
  const across = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})\\s*(?:-|–|—|to)\\s*(${MONTH})\\.?\\s+(\\d{1,2})\\b`, "i").exec(t);
  if (across) return `${SHORT[monthIndex(across[1])]} ${across[2]} – ${SHORT[monthIndex(across[3])]} ${across[4]}`;
  const dayFirst = new RegExp(`\\b(\\d{1,2})\\s*(?:-|–|—|to)\\s*(\\d{1,2})\\s+(${MONTH})\\b`, "i").exec(t);
  if (dayFirst) return `${SHORT[monthIndex(dayFirst[3])]} ${dayFirst[1]}–${dayFirst[2]}`;
  const single = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})\\b`, "i").exec(t);
  if (single && !/^may$/i.test(single[1])) return `${SHORT[monthIndex(single[1])]} ${single[2]}`;

  const month = new RegExp(`\\b(?:in|during|for|this|next|every)\\s+(${MONTH})\\b`, "i").exec(t);
  const when = month ? FULL[monthIndex(month[1])] : undefined;
  const days = new RegExp(`\\b(${NUM})[- ]days?\\b`, "i").exec(t);
  const nights = new RegExp(`\\b(${NUM})[- ]nights?\\b`, "i").exec(t);
  const length = days ? `${count(days[1])} days` : nights ? `${count(nights[1])} nights` : /\blong weekend\b/i.test(t) ? "Long weekend" : /\bweekend\b/i.test(t) ? "Weekend" : /\b(a|one)?\s*week\b/i.test(t) ? "A week" : undefined;
  if (length && when) return `${length} · ${when}`;
  return length ?? when;
}

function budget(t: string): string | undefined {
  const m = /(under|below|up to|max(?:imum)?|around|about)?\s*([$€£])\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?\b\s*(each|per person|pp|a head|per head)?/i.exec(t);
  if (!m) return undefined;
  const amount = Math.round(parseFloat(m[3].replace(/,/g, "")) * (m[4] ? 1000 : 1));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const limit = m[1] && /under|below|up to|max/i.test(m[1]) ? "Under " : "";
  return `${limit}${m[2]}${amount.toLocaleString("en-US")}${m[5] ? " each" : ""}`;
}

const STYLES: [RegExp, string][] = [
  [/\bno (museums?|tourists?|crowds?|chains?|clubs?|hiking|touristy)\b/i, ""],
  [/\bvegetarian\b/i, "Vegetarian"],
  [/\bvegan\b/i, "Vegan"],
  [/\b(food|foodie|restaurants?|ramen|eating|wine|tasting|at the table|good food)\b/i, "Food"],
  [/\blive music|concerts?\b/i, "Live music"],
  [/\b(quiet|slow|relax(?:ing)?)\b/i, "Quiet"],
  [/\b(warm|beach(?:es)?|sunny)\b/i, "Warm"],
  [/\b(hik(?:e|ing)|mountains?|outdoors?)\b/i, "Outdoors"],
  [/\b(nightlife|bars?|party)\b/i, "Nightlife"],
  [/\b(on foot|walking)\b/i, "On foot"],
  [/\badventure\b/i, "Adventure"],
  [/\bromantic\b/i, "Romantic"],
];

function style(t: string): string | undefined {
  const found: { at: number; label: string }[] = [];
  for (const [re, label] of STYLES) {
    const m = re.exec(t);
    if (!m) continue;
    const text = label || `No ${m[1].toLowerCase()}`;
    found.push({ at: m.index, label: text });
  }
  const picked = found.sort((a, b) => a.at - b.at).slice(0, 2).map((f) => f.label);
  return picked.length ? picked.join(", ") : undefined;
}

function place(t: string): TripRead["place"] {
  let best: { at: number; code: string; name: string } | undefined;
  for (const [name, code] of CITIES) {
    const m = new RegExp(`\\b${name}\\b`, "i").exec(t);
    if (!m) continue;
    if (/\bfrom\s+$/i.test(t.slice(Math.max(0, m.index - 6), m.index))) continue; // where you leave from is not where you go
    if (!best || m.index < best.at) best = { at: m.index, code, name };
  }
  return best && { code: best.code, name: best.name };
}

export function readTrip(text: string): TripRead {
  const t = text.trim();
  if (!t) return {};
  return { people: people(t), dates: dates(t), budget: budget(t), style: style(t), place: place(t) };
}
