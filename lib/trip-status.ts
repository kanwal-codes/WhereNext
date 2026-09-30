import { daysUntilTrip } from "@/lib/trip-dates";

/** The four places a trip can be on the home screen. */
export type TripPhase = "underway" | "upcoming" | "past" | "undated";

export type TripDates = { start_date: string | null; end_date: string | null };

export type TripStatus = {
  phase: TripPhase;
  /** Whole days until the trip starts; null when there is no start date. */
  daysUntil: number | null;
  /** Short badge text: "In 12 days", "Underway", "Past", "Planning". */
  badge: string;
};

/** "In 3 days", "In 2 weeks", "In 4 months" - the unit grows with the distance so the badge stays short. */
function untilLabel(days: number): string {
  if (days === 1) return "Tomorrow";
  if (days <= 14) return `In ${days} days`;
  if (days <= 70) {
    const weeks = Math.round(days / 7);
    return `In ${weeks} weeks`;
  }
  const months = Math.round(days / 30);
  return `In ${months} months`;
}

export function tripStatus(trip: TripDates, now: number = Date.now()): TripStatus {
  const daysUntil = daysUntilTrip(trip.start_date, now);
  if (daysUntil === null) return { phase: "undated", daysUntil: null, badge: "Planning" };

  // A trip with no end date is a single day.
  const daysUntilEnd = daysUntilTrip(trip.end_date ?? trip.start_date, now) ?? daysUntil;
  if (daysUntilEnd < 0) return { phase: "past", daysUntil, badge: "Past" };
  if (daysUntil <= 0) return { phase: "underway", daysUntil, badge: daysUntil === 0 ? "Starts today" : "Underway" };
  return { phase: "upcoming", daysUntil, badge: untilLabel(daysUntil) };
}

export type TripFilter = "all" | TripPhase;

/** Underway and upcoming read as one "Upcoming" tab: it is everything still ahead of you. */
export function matchesFilter(status: TripStatus, filter: TripFilter): boolean {
  if (filter === "all") return true;
  if (filter === "upcoming") return status.phase === "upcoming" || status.phase === "underway";
  return status.phase === filter;
}

export function tripCounts<T extends TripDates>(trips: T[], now: number = Date.now()): Record<TripFilter, number> {
  const counts: Record<TripFilter, number> = { all: trips.length, upcoming: 0, underway: 0, past: 0, undated: 0 };
  for (const trip of trips) {
    const status = tripStatus(trip, now);
    counts[status.phase] += 1;
    if (status.phase === "underway") counts.upcoming += 1;
  }
  return counts;
}

/**
 * The one trip worth a big card: what is happening now, else what is coming up soonest, else a
 * trip still being planned, else the most recent past one. Ties keep the list's own order.
 */
export function pickFeatured<T extends TripDates>(trips: T[], now: number = Date.now()): T | null {
  let underway: T | null = null;
  let soonest: { trip: T; days: number } | null = null;
  let undated: T | null = null;
  let past: T | null = null;
  for (const trip of trips) {
    const status = tripStatus(trip, now);
    if (status.phase === "underway") underway ??= trip;
    else if (status.phase === "upcoming" && status.daysUntil !== null) {
      if (!soonest || status.daysUntil < soonest.days) soonest = { trip, days: status.daysUntil };
    } else if (status.phase === "undated") undated ??= trip;
    else past ??= trip;
  }
  return underway ?? soonest?.trip ?? undated ?? past;
}

/** What the featured card calls itself, by phase. */
export function featuredLabel(phase: TripPhase): string {
  switch (phase) {
    case "underway":
      return "Happening now";
    case "upcoming":
      return "Next up";
    case "undated":
      return "Pick up where you left off";
    case "past":
      return "Latest trip";
  }
}

const PHASE_ORDER: Record<TripPhase, number> = { underway: 0, upcoming: 1, undated: 2, past: 3 };

/**
 * Home-screen order: what is happening now, then what is coming soonest, then trips still being
 * planned, then past trips with the most recent first. Ties keep the list's own order.
 */
export function sortForHome<T extends TripDates>(trips: T[], now: number = Date.now()): T[] {
  return trips
    .map((trip, index) => ({ trip, index, status: tripStatus(trip, now) }))
    .sort((a, b) => {
      if (a.status.phase !== b.status.phase) return PHASE_ORDER[a.status.phase] - PHASE_ORDER[b.status.phase];
      const da = a.status.daysUntil ?? 0;
      const db = b.status.daysUntil ?? 0;
      if (da !== db) return a.status.phase === "past" ? db - da : da - db;
      return a.index - b.index;
    })
    .map((entry) => entry.trip);
}
