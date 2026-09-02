import { z } from "zod";
import { preferencesSchema } from "@/packages/contracts/preferences";

export const tripPreferences = preferencesSchema.extend({ interests: z.array(z.string()).default([]) });

export const createTripInput = z.object({
  name: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(160),
  origin: z.string().trim().max(160).optional(),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  travelerCount: z.coerce.number().int().min(1).max(100).optional(),
  preferences: tripPreferences.default({ interests: [] }),
});
export type CreateTripInput = z.infer<typeof createTripInput>;
export type Trip = { id: string; name: string; destination: string; origin?: string | null; duration_days?: number | null; travelers?: number | null; preferences?: Record<string, unknown> | null };
