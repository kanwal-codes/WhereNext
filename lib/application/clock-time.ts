const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isClockTime = (value: unknown): value is string => typeof value === "string" && HHMM.test(value);

/** Best-effort 24h "HH:MM" from a free-text time like the AI itinerary planner emits
 * ("9:00 AM", "14:30", "Morning"). Returns undefined for a vague period label — a stop with
 * no real time is left untimed rather than assigned an arbitrary clock time. */
export function parseClockTime(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (HHMM.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour > 23) return undefined;
  if (hour > 23) return undefined;
  const candidate = `${String(hour).padStart(2, "0")}:${minute}`;
  return isClockTime(candidate) ? candidate : undefined;
}

/** "HH:MM" -> minutes since midnight, for comparing against a travel duration. */
export function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "HH:MM" (24h, as stored) -> "9:00 AM" (12h, for display). */
export function formatClockTime(hhmm: string): string {
  if (!isClockTime(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Any clock time a provider or planner hands us ("18:30", "03:00 PM", "9am") -> "6:30 PM"; anything else is returned as is. */
export function displayClockTime(raw: string): string {
  const parsed = parseClockTime(raw);
  return parsed ? formatClockTime(parsed) : raw;
}
