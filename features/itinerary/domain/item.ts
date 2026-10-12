import { z } from "zod";
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
export const itineraryItemSchema = z.object({ title: z.string().trim().min(1).max(200), /** The exact place, when it was picked from suggestions: located without guessing from the name, and linked to its page. */ providerId: z.string().trim().min(1).max(300).optional(), dayIndex: z.number().int().positive().optional(), position: z.number().int().min(0).max(9999).optional(), locked: z.boolean().optional(), restore: z.boolean().optional(), time: z.union([clockTime, z.null()]).optional(), /** The same place on another day is a second visit, not a move: it gets its own row ("Colosseum (visit 2)"). */ repeat: z.boolean().optional() });
/** Bulk reorder: the full new ordering for every day that changed. */
export const itineraryReorderSchema = z.object({
  order: z.array(z.object({ title: z.string().trim().min(1).max(200), dayIndex: z.number().int().positive(), position: z.number().int().min(0).max(9999) })).min(1).max(200),
});
export type ItineraryItem = { id: string; title: string; day_index: number; position?: number; metadata: Record<string, unknown> | null; created_at: string };
export function canChangeLockedItem(metadata: Record<string, unknown> | null, change: { dayIndex?: number; restore?: boolean; locked?: boolean; position?: number; time?: string | null }) { return metadata?.locked !== true || change.locked === false; }

/** "Colosseum" -> "Colosseum (visit 2)", then "(visit 3)"…, the first free title: the same place on another day, as its own row. */
export function nextVisitTitle(title: string, taken: Iterable<string>): string {
  const base = title.replace(/\s*\(visit \d+\)$/, "");
  const used = new Set(taken);
  for (let n = 2; n < 50; n += 1) {
    const candidate = `${base} (visit ${n})`;
    if (!used.has(candidate)) return candidate.slice(0, 200);
  }
  return `${base} (visit ${Date.now() % 1000})`.slice(0, 200);
}

