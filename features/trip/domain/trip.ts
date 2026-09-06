import { z } from "zod";
import { preferencesSchema } from "@/packages/contracts/preferences";

export const tripPreferences = preferencesSchema.extend({ interests: z.array(z.string()).default([]) });

/** A calendar day, `YYYY-MM-DD`. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** Inclusive nights+1 day count between two ISO dates, or null if the pair is missing/backwards. */
export function tripDurationDays(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;
  return days >= 1 && days <= 365 ? days : null;
}

export const createTripInput = z
  .object({
    name: z.string().trim().min(1).max(120).default("Untitled trip"),
    destination: z.string().trim().max(160).nullable().optional(),
    origin: z.string().trim().max(160).optional(),
    durationDays: z.coerce.number().int().min(1).max(365).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    travelerCount: z.coerce.number().int().min(1).max(100).optional(),
    preferences: tripPreferences.default({ interests: [] }),
    /** Stable across retries of the SAME create attempt — lets the repository upsert instead of
     *  inserting a duplicate trip when a request succeeded but the client never saw the response. */
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => !(v.startDate && v.endDate) || v.endDate >= v.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type CreateTripInput = z.infer<typeof createTripInput>;
export type Trip = {
  id: string;
  name: string;
  destination: string | null;
  origin?: string | null;
  duration_days?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  travelers?: number | null;
  preferences?: Record<string, unknown> | null;
};

/**
 * What a one-line trip description gets turned into for the "new trip" form.
 * Every field is optional — the model only fills what the sentence clearly implies;
 * a bad or out-of-range value is dropped rather than failing the whole parse.
 */
export const parsedTripSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    destination: z.string().trim().max(160).optional(),
    origin: z.string().trim().max(160).optional(),
    durationDays: z.coerce.number().int().min(1).max(365).optional().catch(undefined),
    startDate: isoDate.optional().catch(undefined),
    endDate: isoDate.optional().catch(undefined),
    travelerCount: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
    vibe: z.string().trim().max(120).optional(),
    budget: z.string().trim().max(120).optional(),
    pace: z.string().trim().max(120).optional(),
    transportPreference: z.string().trim().max(120).optional(),
    dietaryNeeds: z.string().trim().max(120).optional(),
  })
  .catch({});
export type ParsedTrip = z.infer<typeof parsedTripSchema>;
