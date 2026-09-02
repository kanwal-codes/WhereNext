import { z } from "zod";

export const decisionInput = z.object({
  kind: z.enum(["destination", "stay_area", "transport", "place", "activity", "budget", "preference"]),
  value: z.record(z.string(), z.unknown()),
  source: z.enum(["user", "assistant", "provider"]).default("user"),
  idempotencyKey: z.string().min(1).max(120).optional(),
});
export type DecisionInput = z.infer<typeof decisionInput>;
