import type { ModelMessage } from "ai";
import type { z } from "zod";
import { generateStructured } from "@/packages/ai/model-policy";
import type { UsageEntry } from "@/lib/ai/pricing";

/**
 * Shared "bulk" block-builder call. Every block-builder (itinerary, budget, comparison,
 * checklist, area/day-trip options, structured-answer, weather-seasonal) used to hand-copy the
 * identical gateway-resolve -> generateStructured -> usage-capture -> catch-return-null
 * sequence — one of those copies (weather-seasonal) drifted and silently ignored the
 * `SUMMARY_MODEL` override every other builder respected, precisely because it wasn't shared.
 * Centralizing it here means a future model-policy change (or bug fix) applies to every builder
 * at once, and each builder file is left with only what's actually unique to it: its system
 * prompt, its schema, and its own post-processing of the result.
 */
export async function runBulkBuilder<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  signal: AbortSignal | undefined,
  onUsage?: (entry: UsageEntry) => void,
): Promise<T | null> {
  try {
    const messages: ModelMessage[] = [{ role: "system", content: system }, { role: "user", content: user }];
    return await generateStructured("bulk", messages, schema, signal, onUsage);
  } catch {
    return null;
  }
}
