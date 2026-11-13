import type { Scenario, DayCase } from "./fixtures";
import { evidenceNames, isGrounded } from "./support";

/** Words that mark a reply's language; the language with the most hits wins. */
const STOP: Record<"en" | "es" | "fr", string[]> = {
  en: ["the", "and", "for", "with", "you", "your", "which", "are", "this", "that", "is", "to", "if", "or", "of", "in", "a"],
  es: ["el", "la", "los", "las", "de", "que", "con", "para", "una", "un", "es", "si", "por", "del", "se", "en", "y", "tu"],
  fr: ["le", "la", "les", "des", "de", "que", "avec", "pour", "une", "un", "est", "si", "par", "du", "et", "en", "vous", "votre"],
};
export function languageOf(text: string): "en" | "es" | "fr" {
  const words = text.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿñáíóú']+/g) ?? [];
  const score = (l: "en" | "es" | "fr") => words.filter((w) => STOP[l].includes(w)).length;
  return (["en", "es", "fr"] as const).reduce((best, l) => (score(l) > score(best) ? l : best), "en");
}

/** Every time in a string as the numbers a writer might print for it: 5:00 PM is also 17:00, 17 and 5. */
function timesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/g)) {
    const h = Number(m[1]);
    const min = m[2] ?? "00";
    if (h > 24) continue;
    const pm = m[3]?.toLowerCase() === "pm";
    const am = m[3]?.toLowerCase() === "am";
    const h24 = pm ? (h % 12) + 12 : am ? h % 12 : h;
    for (const hour of new Set([h, h24, h24 % 12 === 0 ? 12 : h24 % 12])) {
      out.add(String(hour));
      out.add(`${hour}:${min}`);
      out.add(`${String(hour).padStart(2, "0")}:${min}`);
    }
    if (min !== "00") out.add(min);
  }
  return out;
}

const NUMBER = /\d+(?:[.,:]\d+)*/g;
const TRIVIAL = new Set(["1", "2", "3", "4", "5", "6", "7", "10", "24"]);

export type ReplyScore = { invented: string[]; unknownNumbers: string[]; ratingErrors: string[]; hoursErrors: string[]; forbidden: string[]; langOk: boolean; words: number; questions: number; pass: boolean };

export function scoreReply(s: Scenario, text: string): ReplyScore {
  const facts = JSON.stringify(s.evidence) + " " + s.query + " " + s.focus + " " + (s.okPhrases ?? []).join(" ");
  // Addresses are abbreviated in the evidence ("12 High St", "Queen St W") and written out by a model ("High Street", "Queen West"): both count.
  const expand = (t: string) => t.replace(/\bSt\b\.?/g, "Street").replace(/\bAve\b\.?/g, "Avenue").replace(/\bRd\b\.?/g, "Road").replace(/\bW\b/g, "West").replace(/\bE\b/g, "East");
  const lowerFacts = `${facts} ${expand(facts)} ${expand(facts).replace(/\b(?:Street|Avenue|Road)\b /g, "")}`.toLowerCase();
  const names = evidenceNames(s.evidence);

  // Names: capitalised spans of two or more words must appear somewhere in what the model was given (a name, an address, a source).
  // Spans stay on one line and one sentence; "AM"/"PM" are not names.
  const COMMON = new Set(["Google Maps", "Map Button", "Roam"]);
  const LEAD = new Set(["Use", "Try", "Start", "Book", "Check", "Pick", "Go", "For", "If", "Want", "Which", "Do", "Would", "Yo", "Si", "Pour", "Je", "Les", "Los", "Las", "El", "La", "Le", "Un", "Una", "Une", "Para", "Para", "Con", "Avec", "The", "A", "An", "Both", "Also", "Best", "Top", "Open", "Late", "Early", "These", "Those", "Top-rated", "Traditional", "Well-rated", "Highly", "Classic", "Local", "Popular", "Casual", "Great", "Good", "Perfect", "Nearby", "Famous", "Iconic"]);
  const TOKEN = "\\p{Lu}[\\p{L}\\d&'’\\-]*";
  const spanRe = new RegExp(`${TOKEN}(?: (?:of|de|do|da|la|le|du|des|del|en|&|the|d'|l')? ?${TOKEN}){1,5}`, "gu");
  const invented: string[] = [];
  for (const line of text.replace(/\b(?:AM|PM|am|pm)\b/g, "").split("\n")) {
    for (const sentence of line.split(/(?<=[.!?:;¿¡])\s+/)) {
      for (const raw of sentence.match(spanRe) ?? []) {
        const span = raw.trim();
        if (COMMON.has(span) || invented.includes(span)) continue;
        let words = span.split(" ");
        while (words.length > 1 && LEAD.has(words[0])) words = words.slice(1);
        if (words.length < 2 && !span.includes(" ")) continue;
        if (/\bMap\b/.test(span)) continue;
        // A sentence often starts with a capitalised word that is not part of the name ("For Marea Alta"): try the span without its first word too.
        const candidates = [span, words.join(" "), ...(words.length > 2 ? [words.slice(1).join(" ")] : [])];
        if (!candidates.some((c) => lowerFacts.includes(c.toLowerCase()) || isGrounded(c, names))) invented.push(span);
      }
    }
  }

  // Numbers: a rating, a time, a count, a price must come from the evidence (times in either 12h or 24h form).
  const allowed = new Set([...(facts.match(NUMBER) ?? []), ...timesIn(facts)]);
  for (const n of [...allowed]) {
    const v = Number(n);
    if (Number.isFinite(v)) { allowed.add(v.toFixed(1)); if (v >= 1000) { allowed.add((v / 1000).toFixed(1)); allowed.add(String(Math.round(v / 1000))); } }
  }
  // Thousands are written "1,890", "1 890" (French, with a thin space) or "1.890" (Spanish); a model may also round a count ("2.300" for 2,310).
  // Rounded counts within 6% of a real count of 200 or more are accepted; any other number must be exactly in the evidence.
  const counts = [...allowed].map(Number).filter((v) => Number.isFinite(v) && v >= 200);
  const grouped = (text.match(/\d{1,3}(?:[,.\u00a0\u202f ]\d{3})+(?!\d)/g) ?? []).map((g) => Number(g.replace(/[,.\u00a0\u202f ]/g, "")));
  const approx = (v: number) => counts.some((c) => Math.abs(c - v) / c <= 0.06);
  const body = text.replace(/\d{1,3}(?:[,.\u00a0\u202f ]\d{3})+(?!\d)/g, " ");
  const unknownNumbers = [...new Set((body.match(NUMBER) ?? []).map((n) => n.replace(/,/g, ".").replace(/[.:]$/, "")))].filter((n) => !allowed.has(n) && !allowed.has(n.replace(".", ",")) && !TRIVIAL.has(n))
    .concat(grouped.filter((v) => !allowed.has(String(v)) && !approx(v)).map(String));

  // Per line (a bullet is one place): the rating and the hours must be THIS place's, not another's.
  const ratingErrors: string[] = [];
  const hoursErrors: string[] = [];
  const places = (s.evidence.places ?? []) as Array<{ name: string; rating?: number; openingHours?: string[] }>;
  for (const line of text.split("\n")) {
    const lower = line.toLowerCase();
    const at = places.map((p) => ({ p, at: lower.indexOf(p.name.toLowerCase()) })).filter((x) => x.at >= 0).sort((x, y) => x.at - y.at);
    if (!at.length) continue;
    // A rating or an hours range belongs to the place named closest before it on the line (or the first one named, if none comes before).
    const owner = (index: number) => ([...at].reverse().find((x) => x.at <= index) ?? at[0]).p;
    for (const m of line.matchAll(/★\s*(\d(?:[.,]\d)?)/g)) {
      const place = owner(m.index!);
      if (place.rating !== undefined && Number(m[1].replace(",", ".")).toFixed(1) !== place.rating.toFixed(1)) ratingErrors.push(`${place.name}: ${m[1]} vs ${place.rating}`);
    }
    for (const m of line.matchAll(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*(?:–|-|to|a|à|hasta)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?/g)) {
      const place = owner(m.index!);
      if (!place.openingHours?.length) { hoursErrors.push(`${place.name}: hours given but none known`); continue; }
      const ok = timesIn(place.openingHours.join(" "));
      if ([...(m[0].match(NUMBER) ?? [])].some((n) => !ok.has(n) && !ok.has(n.replace(/^0/, "")))) hoursErrors.push(`${place.name}: ${m[0]}`);
    }
  }

  const forbidden = (s.forbidden ?? []).filter((n) => text.toLowerCase().includes(n.toLowerCase()));
  const langOk = languageOf(text) === s.lang;
  const words = text.split(/\s+/).filter(Boolean).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const pass = invented.length === 0 && unknownNumbers.length === 0 && ratingErrors.length === 0 && hoursErrors.length === 0 && forbidden.length === 0 && langOk;
  return { invented, unknownNumbers, ratingErrors, hoursErrors, forbidden, langOk, words, questions, pass };
}

export type DayScore = { ok: boolean; problems: string[] };
export function scoreDay(c: DayCase, text: string): DayScore {
  let parsed: any;
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return { ok: false, problems: ["not JSON"] }; }
  const days = parsed?.days;
  if (!Array.isArray(days) || days.length !== c.days.length) return { ok: false, problems: [`${days?.length ?? 0} days, wanted ${c.days.length}`] };
  const problems: string[] = [];
  const owner = new Map<string, number>();
  const ids = new Map<string, string>();
  for (const d of c.days) for (const [name, id] of d.candidates) { owner.set(name, d.number); ids.set(name, id); }
  days.forEach((d: any, i: number) => {
    const want = c.days[i];
    if (d.label !== `Day ${want.number}`) problems.push(`label "${d.label}"`);
    const stops: any[] = d.stops ?? [];
    const lo = Math.min(2, want.candidates.length + (want.events?.length ?? 0));
    if (stops.length < lo || stops.length > 4) problems.push(`day ${want.number}: ${stops.length} stops`);
    if (want.candidates.length === 0 && stops.length > 0) problems.push(`day ${want.number}: stops on an empty day`);
    for (const s of stops) {
      const isEvent = want.events?.some((e) => e.split(" | ")[0].toLowerCase() === String(s.title).toLowerCase());
      if (isEvent) { if (s.placeId) problems.push("event with a placeId"); continue; }
      if (!owner.has(s.title)) problems.push(`invented "${s.title}"`);
      else if (owner.get(s.title) !== want.number) problems.push(`"${s.title}" on the wrong day`);
      else if (s.placeId && s.placeId !== ids.get(s.title)) problems.push(`wrong id for "${s.title}"`);
      if (stops.length && s.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) problems.push(`time "${s.time}"`);
    }
    if (want.must && !stops.some((s) => String(s.title).toLowerCase().startsWith(want.must!.split(" at ")[0].toLowerCase()))) problems.push("booked event missing");
  });
  return { ok: problems.length === 0, problems: [...new Set(problems)].slice(0, 4) };
}
