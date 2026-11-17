import { closedOnDay } from "@/lib/place-hours";
import type { PlanStop } from "./itinerary-days";

/**
 * Checks a drafted plan in code, after the model has written it: the model is told not to use a ferry or a port as a stop,
 * and sometimes does anyway (seen live 2026-11-14: an Ibiza day of three transit stops). A plan is a list of things to do each
 * day, not a timetable: nothing here reads or sets a stop's time.
 */

// Google's primaryType for the places a traveller passes through rather than visits.
const TRANSIT_TYPE = /(ferry|bus|train|subway|transit|light_rail)_(terminal|station)|airport|heliport|marina|^port$/;
export const isTransitStop = (stop: { kind?: string }, category?: string | null): boolean => stop.kind === "transit" || TRANSIT_TYPE.test(category ?? "");

/** True when the place is shut that whole day (Monday at a museum). ponytail: weekday lines only; add Google's specialDays for holidays. */
export const closedThatDay = (hoursLines: readonly string[] | undefined, isoDate: string): boolean =>
  closedOnDay(hoursLines, new Date(`${isoDate}T00:00:00Z`).getUTCDay());

/** What a plan holds, counted in code, for tests and for the live check script. */
export function planScore(days: Array<{ stops: PlanStop[]; open?: boolean }>) {
  const stops = days.flatMap((day) => day.stops);
  return {
    days: days.length,
    stops: stops.length,
    openDays: days.filter((day) => day.open || !day.stops.length).length,
    thinDays: days.filter((day) => day.stops.length === 1).length,
    transit: stops.filter((stop) => stop.kind === "transit").length,
    oneKindDays: days.filter((day) => day.stops.length >= 3 && new Set(day.stops.map((stop) => stop.kind)).size === 1).length,
  };
}
