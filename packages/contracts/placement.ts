import { z } from "zod";
import { placeSchema } from "./place";

/**
 * Where a place sits in a trip. One place is in exactly one of these states:
 *  - "none"       not in the trip
 *  - "shortlist"  saved, still deciding (a `trip_places` row)
 *  - { dayIndex } scheduled on a day (a `trip_itinerary_items` row + the shortlist row)
 */
export const placementSchema = z.union([
  z.literal("none"),
  z.literal("shortlist"),
  z.object({ dayIndex: z.number().int().min(1).max(365) }),
]);
export type Placement = z.infer<typeof placementSchema>;

export const placementRequestSchema = z.object({ place: placeSchema, placement: placementSchema });

/** The scheduled day, or null when the place is only shortlisted / not in the trip. */
export function placementDay(placement: Placement): number | null {
  return typeof placement === "object" ? placement.dayIndex : null;
}
