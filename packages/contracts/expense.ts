import { z } from "zod";

export const createExpenseInput = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().trim().length(3),
  idempotencyKey: z.string().min(1).max(120).optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseInput>;

export type TripExpense = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type SplitwiseBalance = {
  fromUserId: number;
  toUserId: number;
  amount: string;
  currency: string;
  /** Resolved trip-member display names — "You" when the viewer is that side of the debt.
   *  Falls back to "Someone" only if the Splitwise id can't be matched to a connected member
   *  (e.g. someone added directly on Splitwise, outside this app). */
  fromName: string;
  toName: string;
};
