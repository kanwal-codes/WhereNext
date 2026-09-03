import { z } from "zod";
import { preferencesSchema } from "./preferences";

/**
 * The traveller profile is the subset of trip preferences that carry between
 * trips — plus a home airport. It seeds a new trip's preferences; per-trip facts
 * (dates, arrival, occasion, this trip's transport) are not part of it.
 */
export const travelerProfileSchema = preferencesSchema
  .pick({ interests: true, likes: true, dislikes: true, pace: true, budget: true, groupType: true, dietaryNeeds: true, transportPreference: true, currency: true })
  .extend({
    // ponytail: lives in profiles.data jsonb, not its own column — promote if flight search needs to query by it.
    homeAirport: z.string().trim().min(3).max(8).toUpperCase().optional(),
  });
export type TravelerProfile = z.infer<typeof travelerProfileSchema>;
