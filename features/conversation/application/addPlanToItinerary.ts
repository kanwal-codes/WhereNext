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

/** "7 days in Montreal" over a 2-day plan says the wrong thing — the count comes from the days actually shown. */
export function itineraryTitle(title: string | undefined, days: number): string | undefined {
  if (!title) return undefined;
  return title.replace(/^\d+\s+days?\b/i, `${days} day${days === 1 ? "" : "s"}`);
}
