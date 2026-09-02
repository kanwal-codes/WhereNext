import { z } from "zod";

export const preferencesSchema = z.object({
  groupType: z.string().trim().max(80).optional(),
  occasion: z.string().trim().max(120).optional(),
  vibe: z.string().trim().max(200).optional(),
  interests: z.array(z.string().trim().max(80)).max(20).optional(),
  likes: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  dislikes: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  budget: z.union([z.number().nonnegative(), z.string().trim().max(80)]).optional(),
  pace: z.string().trim().max(80).optional(),
  dates: z.string().trim().max(120).optional(),
  arrival: z.string().trim().max(160).optional(),
  transport: z.string().trim().max(80).optional(),
  transportPreference: z.string().trim().max(80).optional(),
  dietaryNeeds: z.union([z.array(z.string().trim().max(80)).max(20), z.string().trim().max(240)]).optional(),
}).partial();
export type Preferences = z.infer<typeof preferencesSchema>;

const uniqueStrings = (...lists: unknown[]): string[] =>
  Array.from(new Set(lists.flatMap((list) => (Array.isArray(list) ? list : [])).filter((value): value is string => typeof value === "string" && value.trim().length > 0))).slice(0, 30);

/**
 * Merge a preference update onto the stored document. Scalars (budget, pace,
 * groupType, ...) are REPLACED so a correction wins. `dislikes` accumulate — a
 * traveller rarely un-dislikes something and losing one would re-recommend it.
 */
export function mergePreferences(previous: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...previous, ...update };
  if (update.dislikes !== undefined) merged.dislikes = uniqueStrings(previous.dislikes, update.dislikes);
  return merged;
}
