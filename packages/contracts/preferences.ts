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
  /** ISO 4217, e.g. "CAD". Prices across the app are requested and shown in this. */
  currency: z.string().trim().length(3).toUpperCase().optional(),
  dietaryNeeds: z.union([z.array(z.string().trim().max(80)).max(20), z.string().trim().max(240)]).optional(),
}).partial();
export type Preferences = z.infer<typeof preferencesSchema>;

const listPreferenceFieldSchema = z.enum(["interests", "likes", "dislikes", "dietaryNeeds"]);
export const preferenceOperationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), field: listPreferenceFieldSchema, values: z.array(z.string().trim().min(1).max(80)).min(1).max(30) }),
  z.object({ action: z.literal("remove"), field: listPreferenceFieldSchema, values: z.array(z.string().trim().min(1).max(80)).min(1).max(30) }),
  z.object({ action: z.literal("replace"), field: listPreferenceFieldSchema, values: z.array(z.string().trim().min(1).max(80)).max(30) }),
  z.object({ action: z.literal("clear"), field: listPreferenceFieldSchema }),
]);
export const preferenceUpdateSchema = preferencesSchema.extend({
  operations: z.array(preferenceOperationSchema).max(20).optional(),
});
export type PreferenceUpdate = z.infer<typeof preferenceUpdateSchema>;

const uniqueStrings = (...lists: unknown[]): string[] =>
  Array.from(new Set(lists.flatMap((list) => (Array.isArray(list) ? list : [])).filter((value): value is string => typeof value === "string" && value.trim().length > 0))).slice(0, 30);

const normalizeList = (value: unknown): string[] => uniqueStrings(value);
const removeStrings = (previous: unknown, values: string[]): string[] => {
  const removals = new Set(values.map((value) => value.trim().toLocaleLowerCase()));
  return normalizeList(previous).filter((value) => !removals.has(value.trim().toLocaleLowerCase()));
};

/**
 * Merge a preference update onto the stored document. Scalars (budget, pace,
 * groupType, ...) are REPLACED so a correction wins. List fields accumulate by
 * default, while explicit operations can remove, replace, or clear them.
 */
export function mergePreferences(previous: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const { operations, ...plainUpdate } = update as PreferenceUpdate;
  const merged: Record<string, unknown> = { ...previous, ...plainUpdate };
  for (const field of ["interests", "likes", "dislikes", "dietaryNeeds"] as const) {
    if (plainUpdate[field] !== undefined) merged[field] = uniqueStrings(previous[field], plainUpdate[field]);
  }
  for (const operation of operations ?? []) {
    if (operation.action === "add") merged[operation.field] = uniqueStrings(merged[operation.field], operation.values);
    if (operation.action === "remove") merged[operation.field] = removeStrings(merged[operation.field], operation.values);
    if (operation.action === "replace") merged[operation.field] = uniqueStrings(operation.values);
    if (operation.action === "clear") delete merged[operation.field];
  }
  return merged;
}
