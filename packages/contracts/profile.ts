import { z } from "zod";
import { preferencesSchema } from "./preferences";

/**
 * The traveller profile is the subset of trip preferences that carry between
 * trips — plus a home airport. It seeds a new trip's preferences; per-trip facts
 * (dates, arrival, occasion, this trip's transport) are not part of it.
 */
export const travelerProfileSchema = preferencesSchema
  .pick({ interests: true, likes: true, dislikes: true, pace: true, budget: true, groupType: true, dietaryNeeds: true, transportPreference: true, currency: true, language: true, country: true })
  .extend({
    // ponytail: all of the below live in profiles.data jsonb, not their own columns —
    // promote any of them to a real column if a query ever needs to filter/index by it.
    homeAirport: z.string().trim().min(3).max(8).toUpperCase().optional(),
    homeCity: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(280).optional(),
    dietaryNote: z.string().trim().max(200).optional(),
    stayType: z.string().trim().max(40).optional(),
    /** Preferences only — nothing sends these yet. Stored so a future notification
     * sender has somewhere to read from, and so the toggles aren't fake state. */
    notifications: z
      .object({ trips: z.boolean(), prices: z.boolean(), collab: z.boolean(), weekly: z.boolean(), product: z.boolean() })
      .partial()
      .optional(),
    /** The account's light/dark choice, so it follows the user to a new device — localStorage
     * alone only remembers it on the browser that set it. */
    theme: z.enum(["light", "dark"]).optional(),
  });
export type TravelerProfile = z.infer<typeof travelerProfileSchema>;
