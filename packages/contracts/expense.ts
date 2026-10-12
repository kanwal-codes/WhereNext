import { z } from "zod";

export const createExpenseInput = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().trim().length(3),
  idempotencyKey: z.string().min(1).max(120).optional(),
  /** Who paid; defaults to whoever is logging it. Must be on the trip. */
  paidBy: z.string().uuid().optional(),
  /** Who shares it (equally); defaults to everyone on the trip. */
  splitAmong: z.array(z.string().uuid()).min(1).max(24).optional(),
  /** true = also on Splitwise (needs a connected account); false = kept here only. Unset: Splitwise when connected, here otherwise. */
  splitwise: z.boolean().optional(),
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
  /** Who it is shared with; null = everyone on the trip. */
  splitAmong: string[] | null;
  /** "local" expenses are split and settled in this app; "splitwise" ones live on Splitwise too. */
  source: "local" | "splitwise";
};

/** Who owes whom for expenses kept in this app, settled with the fewest payments (per currency). */
export type LocalBalance = { fromUserId: string; toUserId: string; amount: number; currency: string; fromName: string; toName: string };
export type ExpenseMember = { id: string; name: string; isYou: boolean };

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
