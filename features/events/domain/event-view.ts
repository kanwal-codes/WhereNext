import type { EventDetail } from "@/packages/contracts/event";
import { displayClockTime } from "@/lib/application/clock-time";

/** Split a "YYYY-MM-DD HH:MM" or looser string into a friendly day + time. */
export function readableDate(raw: string | null): { day: string; time: string | null } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return { day: raw, time: null };
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" });
  const time = hh
    ? new Date(0, 0, 0, Number(hh), Number(mm)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
  return { day, time };
}

/**
 * The route already summarises `about`; here we only tidy stray markdown heading marks, a lone "Title:" prefix, and blank-line
 * runs — no line-dropping.
 */
export const tidyAbout = (about: string | null | undefined): string =>
  (about ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*#{1,6}\s*/, "").replace(/^\s*Title:\s*/i, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** The line-up note, unless it just echoes acts already listed as pills (with no acts listed, it is all the bill there is). */
export const lineupNoteFor = (d: Pick<EventDetail, "lineupNote" | "performers"> | null): string | null =>
  d?.lineupNote && !(d.performers.length > 0 && d.performers.every((p) => d.lineupNote!.toLowerCase().includes(p.toLowerCase()))) ? d.lineupNote : null;

/** The "Good to know" rows the event has something for, in the order the page shows them. */
export function goodToKnowRows(d: EventDetail | null): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (d?.doorsTime) rows.push(["Doors", displayClockTime(d.doorsTime)]);
  if (d?.showTime) rows.push(["Show", displayClockTime(d.showTime)]);
  if (d?.admission) rows.push(["Admission", d.admission]);
  if (d?.ageInfo) rows.push(["Age", d.ageInfo]);
  if (d?.promoter) rows.push(["Promoter", d.promoter]);
  if (d?.status) rows.push(["Status", d.status]);
  return rows;
}

/** A Google Maps search for the venue: by coordinates when known, else by name and address; null with neither. */
export function venueMapsUrl(d: Pick<EventDetail, "latitude" | "longitude" | "venueAddress" | "city"> | null, venueName: string | null): string | null {
  return d?.latitude && d?.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
    : venueName
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venueName} ${d?.venueAddress ?? d?.city ?? ""}`.trim())}`
      : null;
}
