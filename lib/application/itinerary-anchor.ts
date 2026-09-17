import { clockToMinutes } from "./clock-time";
import { tripDayIndex } from "@/lib/trip-dates";
import type { TripContext } from "./trip-context";

/**
 * "Where will the traveller likely be for lunch/dinner" — a search anchor derived from the
 * itinerary instead of just the accommodation, so a food ask during an active trip can bias
 * toward wherever the day already has them, not just "near the hotel." Deliberately narrow: see
 * each function's own doc comment for what it refuses to guess and why.
 */

export type MealKind = "breakfast" | "lunch" | "dinner";

const MEAL_WINDOW_MINUTES: Record<MealKind, [number, number]> = {
  breakfast: [5 * 60, 11 * 60],
  lunch: [11 * 60, 15 * 60],
  dinner: [17 * 60, 24 * 60],
};

export type ItineraryAnchor = { title: string; latitude: number; longitude: number; dayIndex: number };

/**
 * Which day of the trip "today" is, or null when the trip hasn't started yet or has already
 * ended. This only ever applies to the moment you're actually ON the trip; a future-planning
 * "what should I do on day 3" question doesn't need it — the traveller can just name day 3
 * directly, and RESOLVE's own itinerary lookup already handles a named day (see
 * turn-resolver.ts's directions routing rule for the same pattern).
 *
 * The actual "today vs. start date" math is `lib/trip-dates.ts`'s `tripDayIndex` — not
 * reimplemented here. An earlier version of this function had its own copy (`now`'s raw
 * timestamp diffed against start-of-day and floored) — exactly the bug class `tripDayIndex`'s
 * own doc comment describes fixing (a DST transition's 23- or 25-hour local day can misreport
 * the day count with a floor instead of a midnight-normalized round). Only the upper bound
 * (past the trip's last day) is this function's own addition.
 */
export function currentTripDay(startDate: string | null | undefined, durationDays: number | null | undefined, now: Date): number | null {
  const dayIndex = tripDayIndex(startDate, now.getTime());
  if (dayIndex == null) return null;
  if (durationDays != null && dayIndex > durationDays) return null;
  return dayIndex;
}

/**
 * Where the traveller will likely be for a given meal, from a REAL time they set on an
 * itinerary item — never inferred from `position` order or the item's title (see the `time`
 * field's own doc comment on `TripContext.itinerary`). Two guesses compounding — which meal
 * window an untimed stop might fall in, AND which stop that even is — is how a feature like this
 * turns into confidently wrong advice, so a day with no matching explicit time returns null
 * rather than a plausible-sounding shrug; the caller falls back to the accommodation instead.
 */
export function inferMealAnchor(itinerary: TripContext["itinerary"], meal: MealKind, dayIndex: number): ItineraryAnchor | null {
  const [start, end] = MEAL_WINDOW_MINUTES[meal];
  const hit = itinerary.find((item) => {
    if (item.day_index !== dayIndex || !item.time || item.latitude == null || item.longitude == null) return false;
    const minutes = clockToMinutes(item.time);
    return minutes >= start && minutes < end;
  });
  return hit ? { title: hit.title, latitude: hit.latitude as number, longitude: hit.longitude as number, dayIndex } : null;
}

/** Meal keyword in a free-text message, or null. Deliberately small and literal, like
 *  turn-complexity.ts's hand-curated trivial-phrase set — a false negative here just skips the
 *  feature for that message, which is the safe failure direction. */
export function detectMealAsk(message: string): MealKind | null {
  const text = message.toLowerCase();
  if (/\bbreakfast\b/.test(text)) return "breakfast";
  if (/\b(lunch|brunch)\b/.test(text)) return "lunch";
  if (/\bdinner\b/.test(text)) return "dinner";
  return null;
}
