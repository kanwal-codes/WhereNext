import { z } from "zod";
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
export const itineraryItemSchema = z.object({ title: z.string().trim().min(1).max(200), /** The exact place, when it was picked from suggestions: located without guessing from the name, and linked to its page. */ providerId: z.string().trim().min(1).max(300).optional(), dayIndex: z.number().int().positive().optional(), position: z.number().int().min(0).max(9999).optional(), locked: z.boolean().optional(), restore: z.boolean().optional(), time: z.union([clockTime, z.null()]).optional() });
/** Bulk reorder: the full new ordering for every day that changed. */
export const itineraryReorderSchema = z.object({
  order: z.array(z.object({ title: z.string().trim().min(1).max(200), dayIndex: z.number().int().positive(), position: z.number().int().min(0).max(9999) })).min(1).max(200),
});
export type ItineraryItem = { id: string; title: string; day_index: number; position?: number; metadata: Record<string, unknown> | null; created_at: string };
export function canChangeLockedItem(metadata: Record<string, unknown> | null, change: { dayIndex?: number; restore?: boolean; locked?: boolean; position?: number; time?: string | null }) { return metadata?.locked !== true || change.locked === false; }
