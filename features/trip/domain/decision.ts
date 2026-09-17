import { z } from "zod";
import { boundedRecord } from "@/packages/contracts/shared";

export const decisionInput = z.object({
  kind: z.enum(["destination", "stay", "stay_area", "transport", "leg_transport", "place", "activity", "budget", "preference"]),
  value: boundedRecord(),
  source: z.enum(["user", "assistant", "provider"]).default("user"),
  idempotencyKey: z.string().min(1).max(120).optional(),
});
export type DecisionInput = z.infer<typeof decisionInput>;
