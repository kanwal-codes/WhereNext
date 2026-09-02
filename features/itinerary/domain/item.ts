import { z } from "zod";
export const itineraryItemSchema = z.object({ title: z.string().trim().min(1).max(200), dayIndex: z.number().int().positive().optional(), locked: z.boolean().optional(), restore: z.boolean().optional() });
export type ItineraryItem = { id: string; title: string; day_index: number; metadata: Record<string, unknown> | null; created_at: string };
export function canChangeLockedItem(metadata: Record<string, unknown> | null, change: { dayIndex?: number; restore?: boolean; locked?: boolean }) { return metadata?.locked !== true || change.locked === false; }
