import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const availabilityRangeSchema = z
  .object({ startDate: dateString, endDate: dateString })
  .refine((r) => r.endDate >= r.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] });
export const availabilityInput = z.object({ ranges: z.array(availabilityRangeSchema).min(1).max(10) });
export type AvailabilityInput = z.infer<typeof availabilityInput>;

export const lockDatesInput = z
  .object({ startDate: dateString, endDate: dateString })
  .refine((r) => r.endDate >= r.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] });
export type LockDatesInput = z.infer<typeof lockDatesInput>;

export type AvailabilityRange = { id: string; userId: string; startDate: string; endDate: string };
