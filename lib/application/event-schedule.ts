import { parseClockTime } from "./clock-time";
import { tripDayIndex } from "@/lib/trip-dates";

/** The event's real start time as "HH:MM", if one is known. Ticketmaster embeds it directly in
 * `date` ("YYYY-MM-DD HH:MM"); Eventbrite and others are usually date-only, so this falls back to
 * the free-text `showTime` display field ("8:00 PM") when `date` has no time component. */
export function extractEventTime(rawDate: string | null | undefined, showTime?: string | null): string | undefined {
  const embedded = rawDate?.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/)?.[1];
  return parseClockTime(embedded) ?? parseClockTime(showTime);
}

/** Which day of the trip this event falls on, given the trip's start date — undefined when either
 * date is missing or unparseable, or the event is outside the trip's date range. */
export function extractEventDayIndex(rawDate: string | null | undefined, tripStartDate?: string | null): number | undefined {
  const dateOnly = rawDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!dateOnly) return undefined;
  const eventStart = new Date(`${dateOnly}T00:00:00`).getTime();
  if (Number.isNaN(eventStart)) return undefined;
  return tripDayIndex(tripStartDate, eventStart) ?? undefined;
}
