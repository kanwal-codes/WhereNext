/**
 * The cities of a trip, in order, with the days spent in each. A trip stores one free-text destination
 * ("New York, Rome, Paris"); `trips.stops` is the structured version people edit, and until they do, an
 * even split of the trip's days across the cities is used so every screen can still ask "which city is it on
 * this day". A stop covers its check-in day up to and including its departure day, so consecutive stops share
 * the travel day between them. Pure functions, no I/O.
 */

export type TripStop = { city: string; startDate: string | null; endDate: string | null };

type TripLike = { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_STOPS = 20;

const clean = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const realDay = (value: unknown): string | null => {
  if (typeof value !== "string" || !DAY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
};
const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const diffDays = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Stored stops from the database, or anything a client sent: kept only when every stop has a city, and dates are real and in order. */
export function parseStops(raw: unknown): TripStop[] {
  if (!Array.isArray(raw)) return [];
  const stops: TripStop[] = [];
  for (const entry of raw.slice(0, MAX_STOPS)) {
    const e = entry as Record<string, unknown> | null;
    const city = clean(e?.city, 80);
    if (!city) continue;
    const startDate = realDay(e?.startDate);
    const endDate = realDay(e?.endDate);
    stops.push({ city, startDate, endDate: startDate && endDate && endDate >= startDate ? endDate : null });
  }
  return stops;
}

/** "New York, Rome → Paris, then London" -> ["New York", "Rome", "Paris", "London"]. A single place stays whole. */
export function splitDestinations(destination: string | null | undefined): string[] {
  const parts = clean(destination, 400)
    .split(/\s*(?:,|;|→|->|=>|\/|\bthen\b|\s+to\s+)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return withoutPlaceSuffix(parts.filter((p) => (seen.has(p.toLowerCase()) ? false : (seen.add(p.toLowerCase()), true)))).slice(0, MAX_STOPS);
}

const COUNTRY_ALIASES = ["usa", "us", "uk", "united states", "united states of america", "united kingdom", "england", "scotland", "wales", "turkey", "uae"];
const REGIONS = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york state", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington state", "west virginia", "wisconsin", "wyoming", "district of columbia",
  "ontario", "quebec", "québec", "british columbia", "alberta", "manitoba", "saskatchewan", "nova scotia", "new brunswick", "newfoundland and labrador", "prince edward island", "yukon", "nunavut", "northwest territories",
]);
let countryNames: Set<string> | null = null;
const isCountry = (name: string): boolean => {
  if (!countryNames) {
    countryNames = new Set(COUNTRY_ALIASES);
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const label = names.of(String.fromCharCode(a, b));
        if (label && label !== String.fromCharCode(a, b)) countryNames.add(label.toLowerCase());
      }
    } catch { /* no Intl.DisplayNames: only the aliases are known */ }
  }
  return countryNames.has(name.toLowerCase());
};
const isRegion = (name: string): boolean => /^[A-Z]{2}$/.test(name) || REGIONS.has(name.toLowerCase());

/**
 * "Niagara Falls, Ontario, Canada" is one place written the way maps write it, not three cities. A trailing country, then a trailing
 * province or state, is dropped (one of each, and never down to nothing), so a real list like "Rome, Paris, France" still reads as Rome and Paris.
 */
function withoutPlaceSuffix(parts: string[]): string[] {
  let out = parts;
  if (out.length > 1 && isCountry(out[out.length - 1]!)) out = out.slice(0, -1);
  if (out.length > 1 && isRegion(out[out.length - 1]!)) out = out.slice(0, -1);
  return out;
}

/** Cities in order with the trip's days shared out evenly (earlier cities take the remainder). Without trip dates the cities carry no dates. */
export function defaultStops(destination: string | null | undefined, startDate: string | null | undefined, endDate: string | null | undefined): TripStop[] {
  const cities = splitDestinations(destination);
  const start = realDay(startDate);
  const end = realDay(endDate);
  if (!start || !end || end < start || cities.length === 0) return cities.map((city) => ({ city, startDate: null, endDate: null }));
  const total = diffDays(start, end);
  if (cities.length === 1) return [{ city: cities[0]!, startDate: start, endDate: end }];
  // Nights are shared out; each city's last day is the next one's first.
  const base = Math.floor(total / cities.length);
  const extra = total % cities.length;
  let cursor = start;
  return cities.map((city, i) => {
    const nights = base + (i < extra ? 1 : 0);
    const stop = { city, startDate: cursor, endDate: addDays(cursor, nights) };
    cursor = stop.endDate;
    return stop;
  });
}

/**
 * The route read off the booked stays: one stay per city, in order, so each city runs from the day the previous stay ended
 * (the trip's start for the first) to the day its own stay ends (the trip's end for the last). Null unless there is exactly
 * one dated stay per city, which is the only case where the order alone says which stay is in which city.
 */
export function stopsFromStays(destination: string | null | undefined, stays: Array<{ startsOn: string | null; endsOn: string | null }>, tripStart: string | null | undefined, tripEnd: string | null | undefined): TripStop[] | null {
  const cities = splitDestinations(destination);
  const start = realDay(tripStart);
  const end = realDay(tripEnd);
  const dated = stays.filter((s) => realDay(s.startsOn) && realDay(s.endsOn)).sort((a, b) => a.startsOn!.localeCompare(b.startsOn!));
  if (!start || !end || cities.length < 2 || dated.length !== cities.length || stays.length !== dated.length) return null;
  let cursor = start;
  return cities.map((city, i) => {
    const stop = { city, startDate: cursor, endDate: i === cities.length - 1 ? end : dated[i]!.endsOn! };
    cursor = stop.endDate;
    return stop;
  });
}

/** The saved stops, else the even split, and which of the two this is (the split is a guess the traveller can correct). */
export function effectiveStops(trip: TripLike | null | undefined): { stops: TripStop[]; estimated: boolean } {
  const saved = parseStops(trip?.stops);
  if (saved.length > 0) return { stops: saved, estimated: false };
  return { stops: defaultStops(trip?.destination, trip?.start_date, trip?.end_date), estimated: true };
}

/** The stop a calendar day belongs to: its stay days, and the departure day of the last stop. Null when the day is outside every stop. */
export function stopForDate(stops: TripStop[], date: string | null | undefined): TripStop | null {
  if (!date) return null;
  const dated = stops.filter((s) => s.startDate && s.endDate);
  const inside = dated.find((s) => date >= s.startDate! && date < s.endDate!);
  if (inside) return inside;
  const last = dated[dated.length - 1];
  return last && date === last.endDate ? last : null;
}

/** 1-based trip days a stop spans (its first day and its departure day), counting from the trip's start. Null for an undated stop. */
export function stopDayRange(stop: TripStop, tripStart: string | null | undefined): { startDay: number; endDay: number } | null {
  const start = realDay(tripStart);
  if (!start || !stop.startDate || !stop.endDate) return null;
  return { startDay: diffDays(start, stop.startDate) + 1, endDay: diffDays(start, stop.endDate) + 1 };
}

/** Where the group is, or will be first: today's stop during the trip, the first stop before it, the last after it. */
export function currentStop(stops: TripStop[], today: string): TripStop | null {
  if (stops.length === 0) return null;
  const dated = stops.filter((s) => s.startDate && s.endDate);
  if (dated.length === 0) return stops[0]!;
  if (today < dated[0]!.startDate!) return dated[0]!;
  return stopForDate(stops, today) ?? dated[dated.length - 1]!;
}

/** The stop for a city name, tolerant of case and of the stop being written longer ("Rome, Italy"). */
export function findStop(stops: TripStop[], city: string | null | undefined): TripStop | null {
  const wanted = clean(city, 80).toLowerCase();
  if (!wanted) return null;
  return stops.find((s) => s.city.toLowerCase() === wanted) ?? stops.find((s) => s.city.toLowerCase().includes(wanted) || wanted.includes(s.city.toLowerCase())) ?? null;
}

/** A stay search window for a stop: arrive on its first day, leave on its last. Null when it has no dates. */
export function stayWindow(stop: TripStop): { checkin: string; checkout: string } | null {
  return stop.startDate && stop.endDate && stop.endDate > stop.startDate ? { checkin: stop.startDate, checkout: stop.endDate } : null;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One line per trip day for a prompt: "Day 7 = 2027-06-11 (Fri), Rome". Lets a model label days by the trip's own numbering. */
export function tripCalendar(startDate: string | null | undefined, endDate: string | null | undefined, stops: TripStop[], maxDays = 60): string[] {
  const start = realDay(startDate);
  const end = realDay(endDate);
  if (!start || !end || end < start) return [];
  const lines: string[] = [];
  for (let day = 1, d = start; d <= end && day <= maxDays; day += 1, d = addDays(d, 1)) {
    const city = stopForDate(stops, d)?.city;
    lines.push(`Day ${day} = ${d} (${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]})${city ? `, ${city}` : ""}`);
  }
  return lines;
}

/** "New York Jun 5–Jun 9 · Rome Jun 9–Jun 13", for a prompt. Empty when there is only one place and nothing to say. */
export function describeStops(stops: TripStop[], estimated: boolean): string {
  if (stops.length <= 1) return "";
  const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const parts = stops.map((s) => (s.startDate && s.endDate ? `${s.city} ${label(s.startDate)} to ${label(s.endDate)}` : s.city));
  return `route in order: ${parts.join("; ")}${estimated ? " (the split of days between cities is an estimate; the group has not set it)" : ""}`;
}

/**
 * The same stops after the trip's dates changed (null when there is nothing to change: no stops, no old or new start, or the
 * dates did not move). When the whole trip slid by the same amount the stops slide with it, lengths kept, so a trip pushed back
 * three days keeps Rome at four nights. When only the start or only the end moved, the first city gains or loses those days
 * (or the last one does) and the cities in between stay where they are.
 */
export function shiftStops(stops: TripStop[], oldStart: string | null | undefined, newStart: string | null | undefined, oldEnd?: string | null, newEnd?: string | null): TripStop[] | null {
  const from = realDay(oldStart);
  const to = realDay(newStart);
  if (stops.length === 0 || !from || !to) return null;
  const startDelta = diffDays(from, to);
  const [e0, e1] = [realDay(oldEnd), realDay(newEnd)];
  const endDelta = e0 && e1 ? diffDays(e0, e1) : startDelta;
  if (startDelta === 0 && endDelta === 0) return null;
  if (startDelta === endDelta) return stops.map((s) => ({ city: s.city, startDate: s.startDate ? addDays(s.startDate, startDelta) : null, endDate: s.endDate ? addDays(s.endDate, startDelta) : null }));
  const last = stops.length - 1;
  const edged = stops.map((s, i) => ({
    city: s.city,
    startDate: i === 0 && s.startDate === from ? to : s.startDate,
    endDate: i === last && e0 && e1 && s.endDate === e0 ? e1 : s.endDate,
  }));
  return edged.some((s, i) => s.startDate !== stops[i]!.startDate || s.endDate !== stops[i]!.endDate) ? edged : null;
}
