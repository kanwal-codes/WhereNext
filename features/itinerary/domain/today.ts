export type ItineraryRow = { id: string; title: string; day_index: number; position?: number; metadata?: { time?: unknown; latitude?: unknown; longitude?: unknown } | null };

export const timeOf = (r: ItineraryRow) => (typeof r.metadata?.time === "string" ? r.metadata.time : "");
export const minutesOf = (t: string) => { const [h, m] = t.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };

const isDay = (value: string | null | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** "Wednesday, September 30": the actual date of this trip day, read from the string so no timezone can shift it. */
export function dateLineFor(start: string | null | undefined, dayIndex: number | null): string | null {
  if (!isDay(start) || dayIndex == null) return null;
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + dayIndex - 1);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** "September 30": the day the trip starts, for the screen shown before it does. */
export function startLineFor(start: string | null | undefined): string | null {
  return isDay(start) ? new Date(`${start}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : null;
}

/** The calendar day (YYYY-MM-DD) of 1-based trip day `dayIndex`. */
export function isoDayOf(start: string | null | undefined, dayIndex: number | null): string | null {
  return dayIndex != null && start ? new Date(Date.parse(`${start}T00:00:00Z`) + (dayIndex - 1) * 86_400_000).toISOString().slice(0, 10) : null;
}

/** "Now", "In 45 min", "In 2h 5m": how long until a stop, from minutes (null with no time to count to). */
export function untilLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `In ${minutes} min`;
  return `In ${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

/** The first day that has stops (before the trip starts, the screen shows what it will be like). */
export const firstPlannedDay = (rows: ItineraryRow[]): number | null => {
  const first = rows.reduce((m, r) => Math.min(m, r.day_index), Infinity);
  return Number.isFinite(first) ? first : null;
};

/** One day's stops in the order they happen: by time, then the plan's own order; stops with no time come last. */
export const stopsOfDay = (rows: ItineraryRow[], day: number): ItineraryRow[] =>
  rows
    .filter((r) => r.day_index === day)
    .sort((a, b) => (timeOf(a) || "99:99").localeCompare(timeOf(b) || "99:99") || (a.position ?? 0) - (b.position ?? 0));

/** What is still ahead on a day under way: stops with no time, and those that began within the last half hour or are yet to. */
export const stopsAhead = (rows: ItineraryRow[], nowMinutes: number): ItineraryRow[] =>
  rows.filter((r) => { const t = minutesOf(timeOf(r)); return t == null || t >= nowMinutes - 30; });

const coordsOf = (r: ItineraryRow): [number, number] | null => {
  const lng = Number(r.metadata?.longitude);
  const lat = Number(r.metadata?.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0) ? [lng, lat] : null;
};

/** "lng,lat" for each stop that has a real place, for the picture of the day's map. */
export const mapMarkers = (rows: ItineraryRow[]): string[] => rows.flatMap((r) => { const c = coordsOf(r); return c ? [`${c[0]},${c[1]}`] : []; });

/** A Google Maps route to a stop, or null when it has no place. */
export function directionsTo(row: ItineraryRow | undefined): string | null {
  const c = row ? coordsOf(row) : null;
  return c ? `https://www.google.com/maps/dir/?api=1&destination=${c[1]},${c[0]}` : null;
}
