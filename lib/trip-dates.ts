import { tripDurationDays } from "@/features/trip/domain/trip";

/** "Mar 14"-style day label. Parses as LOCAL time — a bare "2026-03-14" is otherwise read as UTC
 *  midnight, which renders as the PREVIOUS day for anyone behind UTC (live-caught duplicated
 *  6 ways across the app: five identical unexported `fmtDay` copies — app/trips/[tripId]/
 *  (animated)/page.tsx, .../bookings/page.tsx, components/StayPanel.tsx, features/itinerary/ui/
 *  ItinerarySurface.tsx, lib/decisions-ui.ts — plus features/stays/ui/StaySurface.tsx's own,
 *  every one missing this file's already-correct local-time parse, so trip dates 2026-10-10 →
 *  2026-10-14 displayed as "Oct 9 → Oct 13" on the Stay page. Consolidated here, the one place
 *  that already had it right, instead of fixing six duplicates independently. */
export const fmtDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const day = fmtDay;

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

/** 1-based day index for `now` given the trip start date; null before the trip or with no date.
 *  Compares whole calendar days the same way `daysUntilTrip` does — `now` normalized to local
 *  midnight first, then a rounded (not floored) day count — so a DST transition (a 23- or 25-
 *  hour local day) can't misreport which day of the trip "today" is. */
export function tripDayIndex(startDate?: string | null, now: number = Date.now()): number | null {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  if (Number.isNaN(start)) return null;
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const elapsed = Math.round((todayMidnight.getTime() - start) / 86_400_000);
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
