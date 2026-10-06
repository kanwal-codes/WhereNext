export type AvailabilityRangeInput = { userId: string; startDate: string; endDate: string };
export type Overlap = { startDate: string; endDate: string; userIds: string[] };

const DAY_MS = 86_400_000;
const toEpochDay = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);
const fromEpochDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function sameMembers(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Which date(s) everyone — or some subset — is free, from each member's own submitted
 * ranges. Walks day-by-day between the earliest and latest submitted date, so both full-group
 * and partial overlaps fall out of the same pass; merges consecutive days with the identical
 * member set into one interval. Sorted by coverage (most members first), then earliest first.
 *
 * ponytail: O(days * members) — trip-length date ranges and a handful of members, not
 * hundreds; revisit with an interval-sweep only if that scale ever shows up.
 */
export function computeOverlaps(allRanges: AvailabilityRangeInput[]): Overlap[] {
  // Rows stored before the input schema bounded span (or written straight to the table) can still be
  // enormous; skip them rather than walk millions of days on every GET.
  const ranges = allRanges.filter((r) => (toEpochDay(r.endDate) - toEpochDay(r.startDate)) / DAY_MS <= 400);
  if (ranges.length === 0) return [];

  let minDay = Infinity;
  let maxDay = -Infinity;
  for (const r of ranges) {
    minDay = Math.min(minDay, toEpochDay(r.startDate));
    maxDay = Math.max(maxDay, toEpochDay(r.endDate));
  }

  const overlaps: Overlap[] = [];
  let windowStart: number | null = null;
  let windowMembers: string[] = [];

  const flush = (endDay: number) => {
    if (windowStart !== null && windowMembers.length > 0) {
      overlaps.push({ startDate: fromEpochDay(windowStart), endDate: fromEpochDay(endDay), userIds: windowMembers });
    }
  };

  for (let day = minDay, prevDay = minDay; day <= maxDay; day += DAY_MS) {
    const dayStr = fromEpochDay(day);
    const members = [...new Set(ranges.filter((r) => r.startDate <= dayStr && dayStr <= r.endDate).map((r) => r.userId))].sort();
    const changed = windowStart === null || !sameMembers(members, windowMembers);
    if (changed) {
      flush(prevDay);
      windowStart = members.length > 0 ? day : null;
      windowMembers = members;
    }
    prevDay = day;
  }
  flush(maxDay);

  return overlaps.sort((a, b) => b.userIds.length - a.userIds.length || a.startDate.localeCompare(b.startDate));
}
