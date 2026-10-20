import { z } from "zod";

/** What the extractor pulls out of an imported page. All fields best-effort. */
export const tripImportResultSchema = z.object({
  destination: z.string().trim().min(1).max(160),
  suggestedName: z.string().trim().min(1).max(160),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  places: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    note: z.string().trim().max(400).optional(),
  })).max(30).default([]),
  notes: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
});
