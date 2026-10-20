import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const availabilityRangeSchema = z
  .object({ startDate: dateString, endDate: dateString })
  .refine((r) => r.endDate >= r.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] })
  // computeOverlaps walks every calendar day between the earliest and latest stored date on each GET, so an
  // unbounded span (0001-01-01..9999-12-31 is ~3.6M iterations) is a CPU cost any member can store.
  .refine((r) => r.startDate >= "2000-01-01" && r.endDate <= "2100-12-31" && (Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000 <= 400, { message: "Pick a range within about a year", path: ["endDate"] });
export const availabilityInput = z.object({ ranges: z.array(availabilityRangeSchema).min(1).max(10) });

export const lockDatesInput = z
  .object({ startDate: dateString, endDate: dateString })
  .refine((r) => r.endDate >= r.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] });
