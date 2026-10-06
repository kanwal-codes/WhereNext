/**
 * "Open · closes 10 PM" / "Closed · opens 11 AM", from Google's open-now flag and its seven weekday lines
 * ("Monday: 11:00 AM – 10:00 PM", "Tuesday: Closed", "Wednesday: Open 24 hours", split shifts with commas).
 *
 * The place's own clock is not on the card, so "today" and "now" there are estimated from its longitude (a whole-hour
 * offset): right to within an hour, which only matters in the hour around an opening or closing time. The open/closed
 * answer itself is always Google's flag, never this estimate.
 */
export type HoursPill = { open: boolean; label: string };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SPACES = /[   ]/g;

type Range = { from: number; to: number } | "all" | "closed";

function minutes(clock: string): number | null {
  const m = clock.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return h * 60 + Number(m[2] ?? 0);
}

/** One weekday line to its opening ranges, in minutes from midnight; null when the line cannot be read. */
function parseLine(line: string): Range[] | null {
  const body = line.replace(SPACES, " ").replace(/^[^:]*:\s*/, "").trim();
  if (!body) return null;
  if (/closed/i.test(body)) return ["closed"];
  if (/24 hours|open 24/i.test(body)) return ["all"];
  const out: Range[] = [];
  for (const part of body.split(/,\s*/)) {
    const [a, b] = part.split(/\s*[–—-]\s*/);
    // "11:00 – 10:00 PM": the first time borrows the second's AM/PM when it has none.
    const to = b ? minutes(b) : null;
    let from = a ? minutes(a) : null;
    if (from == null || to == null) return null;
    if (!/am|pm/i.test(a) && /pm/i.test(b) && from + 12 * 60 <= to) from += 12 * 60;
    out.push({ from, to });
  }
  return out;
}

const clock = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mm = m % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h24 < 12 ? "AM" : "PM"}`;
};

/** The pill for a place, or null when there is nothing worth saying. `now` is a UTC instant (tests pass one). */
export function hoursPill(openNow: boolean | undefined, lines: readonly string[] | undefined, longitude: number | undefined, now: Date = new Date()): HoursPill | null {
  if (openNow === undefined) return null;
  const closed: HoursPill = { open: false, label: "Closed now" };
  const open: HoursPill = { open: true, label: "Open now" };
  if (!lines?.length || longitude == null || !Number.isFinite(longitude)) return openNow ? open : closed;

  const offset = Math.round(longitude / 15);
  const local = new Date(now.getTime() + offset * 3_600_000);
  const day = local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const byDay = new Map<number, Range[] | null>();
  for (const line of lines) {
    const name = line.replace(SPACES, " ").split(":")[0]?.trim().toLowerCase();
    const index = DAYS.indexOf(name ?? "");
    if (index >= 0) byDay.set(index, parseLine(line));
  }
  const today = byDay.get(day);

  if (openNow) {
    if (!today || today[0] === "all") return today?.[0] === "all" ? { open: true, label: "Open 24 hours" } : open;
    const ranges = today.filter((r): r is { from: number; to: number } => typeof r === "object");
    // The range that holds now (an overnight one runs past midnight), else the last one of the day.
    const current = ranges.find((r) => (r.to > r.from ? minute >= r.from && minute < r.to : minute >= r.from || minute < r.to)) ?? ranges.at(-1);
    return current ? { open: true, label: `Open · until ${clock(current.to)}` } : open;
  }

  const ranges = (today ?? []).filter((r): r is { from: number; to: number } => typeof r === "object");
  const later = ranges.find((r) => r.from > minute);
  if (later) return { open: false, label: `Closed · opens ${clock(later.from)}` };
  for (let step = 1; step <= 7; step++) {
    const next = byDay.get((day + step) % 7);
    const first = next?.find((r): r is { from: number; to: number } => typeof r === "object");
    if (first) {
      const when = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(day + step) % 7];
      return { open: false, label: `Closed · opens ${when} ${clock(first.from)}` };
    }
  }
  return closed;
}
