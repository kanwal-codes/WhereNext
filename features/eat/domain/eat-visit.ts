import type { Place } from "@/packages/contracts/place";

/**
 * What someone says about the visit, every part optional: how many are going, on what day, at what time. An empty part ("" or null) means "don't mind":
 * a search with none of them is the plain list of places; each one given narrows or annotates it (who is open then, a ready request to send).
 */
export type Visit = { guests: number | null; date: string; time: string };
export const NO_VISIT: Visit = { guests: null, date: "", time: "" };
/** From this many, a restaurant usually wants a call rather than a form. */
export const LARGE_GROUP = 8;
export const MAX_GUESTS = 20;

export const visitSet = (v: Visit) => v.guests !== null || Boolean(v.date) || Boolean(v.time);
/** Is there a date or hour to check opening hours against? */
export const visitTimed = (v: Visit) => Boolean(v.date) || Boolean(v.time);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const today = () => new Date().toLocaleDateString("en-CA");
const dayOf = (v: Visit) => new Date(`${v.date || today()}T12:00:00`).getDay();

/** "19:30" → "7:30 PM". */
export function fmtTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
/** "2026-12-05" → "Sat, Dec 5". */
function fmtVisitDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(d);
}

/** "Table for 4 · Sat, Dec 5 · 7:30 PM": only the parts that were given. */
export function visitLine(v: Visit): string {
  return [v.guests !== null ? `Table for ${v.guests}` : null, v.date ? fmtVisitDay(v.date) : null, v.time ? fmtTime(v.time) : null].filter(Boolean).join(" · ");
}

type Span = [number, number];
/** One clock time of a Google hours line ("11:00 AM", or "5:00" when the AM/PM comes from the other end) in minutes; null if unreadable. */
function clock(text: string, meridiem?: string): { minutes: number; meridiem?: string } | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(text.trim());
  if (!m) return null;
  const mer = (m[3] ?? meridiem)?.toUpperCase();
  let h = Number(m[1]) % 12;
  if (mer === "PM") h += 12;
  return { minutes: h * 60 + Number(m[2] ?? 0), meridiem: mer };
}

/** The open spans of one day's line ("Friday: 11:00 AM – 3:00 PM, 5:00 – 10:00 PM"), in minutes from midnight; a close after midnight runs past 1440. Null if the line cannot be read. */
export function spansOf(line: string): Span[] | null {
  const body = line.slice(line.indexOf(":") + 1).replace(/[   ]/g, " ").trim();
  if (/^closed$/i.test(body)) return [];
  if (/^open 24 hours$/i.test(body)) return [[0, 1440]];
  const spans: Span[] = [];
  for (const part of body.split(",")) {
    const [from, to] = part.split(/\s*[–-]\s*/);
    if (!from || !to) return null;
    const end = clock(to);
    if (!end) return null;
    const start = clock(from, end.meridiem);
    if (!start) return null;
    let s = start.minutes;
    let e = end.minutes;
    // "5:00 – 10:00 PM" read with PM for both is right; "11:00 – 2:00 PM" would make 11 PM, so a start after its end drops back to the morning.
    if (!/[AP]M/i.test(from) && s > e && s >= 12 * 60) s -= 12 * 60;
    if (e <= s) e += 24 * 60;
    spans.push([s, e]);
  }
  return spans;
}

/**
 * Is the place open when the visit says? True or false when its hours are known, null when they are not or no day or hour was given. A day with no
 * hour only asks that it is not closed that day.
 */
export function openAt(place: Pick<Place, "openingHours">, v: Visit): boolean | null {
  if (!visitTimed(v) || !place.openingHours?.length) return null;
  const name = DAYS[dayOf(v)]!;
  const spans = spansOf(place.openingHours.find((l) => l.startsWith(name)) ?? "");
  const yesterday = spansOf(place.openingHours.find((l) => l.startsWith(DAYS[(dayOf(v) + 6) % 7]!)) ?? "");
  if (spans === null) return null;
  if (!v.time) return spans.length > 0;
  const [h, m] = v.time.split(":").map(Number);
  const at = h! * 60 + m!;
  // A late night from the evening before still counts: its close runs past midnight.
  return spans.some(([s, e]) => at >= s && at < e) || Boolean(yesterday?.some(([, e]) => e > 1440 && at < e - 1440));
}

/** One line to put by a restaurant when the visit matters: closed then, or a big group. Null when there is nothing to warn about. */
export function visitNote(place: Pick<Place, "openingHours">, v: Visit): string | null {
  if (v.guests !== null && v.guests >= LARGE_GROUP) return `For ${v.guests} or more, call ahead: most places don’t take big groups online.`;
  if (openAt(place, v) === false) {
    const day = DAYS[dayOf(v)]!;
    const line = place.openingHours?.find((l) => l.startsWith(day))?.slice(day.length + 1).replace(/[   ]/g, " ").trim();
    return !line || /^closed$/i.test(line) ? `Closed on ${day}s.` : `Closed then. ${day} hours: ${line}.`;
  }
  return null;
}

/** The message to send or say: "Hi, could I book a table for 4 on Sat, Dec 5 at 7:30 PM?" */
export function requestText(name: string, v: Visit): string {
  const who = v.guests !== null ? ` for ${v.guests}` : "";
  const when = [v.date ? `on ${fmtVisitDay(v.date)}` : null, v.time ? `at ${fmtTime(v.time)}` : null].filter(Boolean).join(" ");
  return `Hi, could I book a table${who}${when ? ` ${when}` : ""} at ${name}?`;
}
