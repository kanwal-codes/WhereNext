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

export type SplitwiseBalance = { fromUserId: number; toUserId: number; amount: string; currency: string };
