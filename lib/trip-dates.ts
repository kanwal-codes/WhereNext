import { tripDurationDays } from "@/features/trip/domain/trip";

const day = (iso: string) => {
  // Parse as local time — a bare "2026-03-14" is UTC midnight, which renders as the
  // previous day for anyone behind UTC.
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Days from `now` until the trip starts (negative once it has); null with no start date.
 *  Compares whole calendar days — `now`'s time-of-day never shifts the result, so "today"
 *  reads as 0 whether it's 12:01am or 11:59pm. */
export function daysUntilTrip(startDate?: string | null, now: number = Date.now()): number | null {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  if (Number.isNaN(start)) return null;
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  return Math.round((start - todayMidnight.getTime()) / 86_400_000);
}

/** 1-based day index for `now` given the trip start date; null before the trip or with no date. */
export function tripDayIndex(startDate?: string | null, now: number = Date.now()): number | null {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  if (Number.isNaN(start)) return null;
  const elapsed = Math.floor((now - start) / 86_400_000);
  return elapsed < 0 ? null : elapsed + 1;
}

/**
 * How a trip's timing reads on cards and the overview:
 * "Mar 14 – Mar 20 (7 days)" when dated, "7 days" when only a length is known,
 * else `empty` (default "Not set") so every card still says something.
 */
export function tripWhen(
  startDate?: string | null,
  endDate?: string | null,
  durationDays?: number | null,
  empty = "Not set",
): string {
  const days = tripDurationDays(startDate, endDate) ?? durationDays ?? null;
  const count = days ? `${days} day${days === 1 ? "" : "s"}` : null;
  if (startDate && endDate) return `${day(startDate)} – ${day(endDate)}${count ? ` (${count})` : ""}`;
  return count ?? empty;
}
