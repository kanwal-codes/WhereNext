import { addDaysIso, readDates, readParty, withoutDates } from "./stay-ask";

/** What a sentence plainly says about a meal out: how many, which day, what time. Read in code so it is exact and instant; anything vaguer is left to the model. */
export type EatAsk = { adults?: number; date?: string; time?: string };
/** What a sentence plainly says about a flight: the days, the party and one way. */
export type FlightsAsk = { depart?: string; ret?: string; oneWay?: boolean; adults?: number };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "7:30 pm", "8pm", "19:30", "noon": a clock time written plainly, as "HH:MM". A bare "at 8" is left to the model (evening for a meal). */
export function readTime(text: string): string | undefined {
  const ampm = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?m\b\.?/i);
  if (ampm) {
    const h = (Number(ampm[1]) % 12) + (ampm[3]!.toLowerCase() === "p" ? 12 : 0);
    return `${String(h).padStart(2, "0")}:${ampm[2] ?? "00"}`;
  }
  const clock = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (clock) return `${clock[1]!.padStart(2, "0")}:${clock[2]}`;
  if (/\bnoon\b/i.test(text)) return "12:00";
  return undefined;
}

/** "saturday", "this friday", "next monday": the day it falls on after today ("next" adds a week). Today's own name means a week on. */
function readWeekday(text: string, today: string): string | undefined {
  const m = text.match(new RegExp(`\\b(this|next|on)?\\s*(${WEEKDAYS.join("|")})\\b`, "i"));
  if (!m) return undefined;
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const target = WEEKDAYS.indexOf(m[2]!.toLowerCase());
  let ahead = (target - dow + 7) % 7;
  if (ahead === 0) ahead = 7;
  // "next friday", asked before this week's friday, means the one after it.
  if (m[1]?.toLowerCase() === "next" && target > dow) ahead += 7;
  return addDaysIso(today, ahead);
}

export function readEatAsk(query: string, today: string): EatAsk {
  const text = query.replace(/\s+/g, " ").trim();
  const out: EatAsk = {};
  const time = readTime(text);
  if (time) out.time = time;
  // The clock time is taken out first, so "8pm" is never read as a day or a count.
  const rest = withoutDates(text.replace(/\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\b\.?/gi, " ").replace(/\b\d{1,2}:\d{2}\b/g, " "));
  const party = readParty(rest).adults;
  if (party !== undefined) out.adults = party;
  const dates = readDates(text, today);
  // A calendar date named outright wins; otherwise a weekday named outright beats a vague \"this weekend\" (which, asked on a Sunday, would otherwise mean today).
  const explicitDate = withoutDates(text) !== text;
  const date = explicitDate ? dates.checkin : (readWeekday(rest, today) ?? dates.checkin);
  if (date) out.date = date;
  return out;
}

export function readFlightsAsk(query: string, today: string): FlightsAsk {
  const text = query.replace(/\s+/g, " ").trim();
  const out: FlightsAsk = {};
  if (/\bone[\s-]*way\b/i.test(text)) out.oneWay = true;
  const adults = readParty(withoutDates(text)).adults;
  if (adults !== undefined) out.adults = adults;
  const dates = readDates(text, today);
  if (dates.checkin) {
    out.depart = dates.checkin;
    const back = dates.checkout ?? (dates.nights ? addDaysIso(dates.checkin, dates.nights) : undefined);
    if (back && !out.oneWay) out.ret = back;
  }
  return out;
}
