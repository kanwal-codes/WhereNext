import { mutate } from "@/lib/client/mutation-queue";
import { parseClockTime } from "@/lib/application/clock-time";

export type PlanStop = { time?: string; title: string; placeId?: string };

/** Day label -> 1-based day index ("Day 3" -> 3), falling back to the day's position in the plan. */
export const dayIndexFromLabel = (label: string, fallback: number): number => {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : fallback;
};

/**
 * Adds a day's stops to the trip itinerary, one command per stop. Carries the place id through when the
 * stop is a real place (so the itinerary row can open its panel later); a vague "Morning" label doesn't
 * parse to a real time and is left off rather than guessed. Resolves to how many stops failed to save.
 */
export async function addStopsToItinerary(tripId: string, dayIndex: number, stops: PlanStop[]): Promise<number> {
  let failures = 0;
  for (const stop of stops) {
    const time = parseClockTime(stop.time);
    const res = await mutate("/api/commands", {
      method: "POST",
      body: { type: "add_itinerary_item", tripId, title: stop.title, dayIndex, ...(stop.placeId ? { providerId: stop.placeId } : {}), ...(time ? { time } : {}) },
      announce: ["itinerary"],
    });
    if (!res.ok) failures += 1;
  }
  return failures;
}

const norm = (title: string) => title.trim().toLowerCase();

/**
 * Makes each day hold exactly these stops: what the trip has there now and the new plan does not keep is removed (a locked item
 * stays), stops already there are left alone, the rest are added. For a card that reworks days already in the trip, where adding would
 * only pile new stops on top of the old ones. Throws when the current itinerary cannot be read, so nothing is half-replaced.
 * Resolves to how many writes failed.
 */
export async function replaceDaysInItinerary(tripId: string, days: Array<{ dayIndex: number; stops: PlanStop[] }>): Promise<number> {
  const res = await fetch(`/api/trips/${tripId}/itinerary`);
  if (!res.ok) throw new Error("itinerary unavailable");
  const current = ((await res.json()) as { items?: Array<{ title: string; day_index: number; metadata?: { locked?: boolean } | null }> }).items ?? [];
  let failures = 0;
  for (const day of days) {
    const keep = new Set(day.stops.map((stop) => norm(stop.title)));
    const here = current.filter((item) => item.day_index === day.dayIndex);
    const have = new Set(here.map((item) => norm(item.title)));
    for (const item of here) {
      if (keep.has(norm(item.title)) || item.metadata?.locked === true) continue;
      const removed = await mutate(`/api/trips/${tripId}/itinerary`, { method: "DELETE", body: { title: item.title }, announce: ["itinerary"] });
      if (!removed.ok) failures += 1;
    }
    failures += await addStopsToItinerary(tripId, day.dayIndex, day.stops.filter((stop) => !have.has(norm(stop.title))));
  }
  return failures;
}

/** "7 days in Montreal" over a 2-day plan says the wrong thing — the count comes from the days actually shown. */
export function itineraryTitle(title: string | undefined, days: number): string | undefined {
  if (!title) return undefined;
  return title.replace(/^\d+\s+days?\b/i, `${days} day${days === 1 ? "" : "s"}`);
}
