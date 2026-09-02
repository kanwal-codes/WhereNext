import { tripDurationDays } from "@/features/trip/domain/trip";

const day = (iso: string) => {
  // Parse as local time — a bare "2026-03-14" is UTC midnight, which renders as the
  // previous day for anyone behind UTC.
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

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
