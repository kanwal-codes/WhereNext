import { clockToMinutes, isClockTime } from "./clock-time";

/** Does the gap between two stops' clock times cover the travel time between them?
 * Returns null when either stop has no time set — nothing to check. */
export function computeTimeFit(fromTime: string | undefined, toTime: string | undefined, travelMinutes: number | null): { availableMinutes: number; neededMinutes: number } | null {
  if (!isClockTime(fromTime) || !isClockTime(toTime) || travelMinutes == null) return null;
  return { availableMinutes: clockToMinutes(toTime) - clockToMinutes(fromTime), neededMinutes: travelMinutes };
}

export const isTimeFitAtRisk = (fit: { availableMinutes: number; neededMinutes: number } | null): boolean =>
  fit != null && fit.availableMinutes < fit.neededMinutes;
