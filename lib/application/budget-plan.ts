import { z } from "zod";
import { AI_DEADLINE_MS, gatewayFor, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { RetrievedEvidence } from "./retrieve";
import type { TripContext } from "./trip-context";

const lineSchema = z.object({
  category: z.string().trim().min(1).max(40),
  low: z.coerce.number().nonnegative(),
  typical: z.coerce.number().nonnegative(),
  high: z.coerce.number().nonnegative(),
  note: z.string().trim().max(120).optional(),
});
const budgetSchema = z.object({
  currency: z.string().trim().min(1).max(8),
  perPerson: z.boolean().default(true),
  summary: z.string().trim().min(1).max(200),
  lines: z.array(lineSchema).min(2).max(6),
  setBudget: z.coerce.number().nonnegative().optional(),
  tripNote: z.string().trim().max(160).optional(),
});

const SYSTEM = `You estimate a realistic on-the-ground DAILY spending plan for a trip. Flights and lodging are booked separately — EXCLUDE them. Return JSON only:
{"currency":"<ISO 4217>","perPerson":true,"summary":"<ONE sentence: the rough daily figure, and whether it fits their stated budget if they gave one>","lines":[{"category":"Food & drink","low":N,"typical":N,"high":N,"note":"<short>"}],"setBudget":<their stated daily budget, or omit>,"tripNote":"<e.g. ~X per person over N days, excludes flights & hotel>"}
Rules:
- Pick 3–5 categories that fit THIS trip from: Food & drink, Activities & sights, Local transit, Nightlife, Shopping, Incidentals. Omit any that don't apply. If the traveller likes nightlife/going out, Nightlife is its own line and is not tiny.
- typical = what a comfortable mid-range traveller ACTUALLY spends on a normal day here: sit-down meals (not just counter service), a coffee or two, paid attractions, a few drinks out. It is a realistic figure, not a frugal floor — do not lowball it. low = a careful day, high = a generous day.
- Sanity check: the typical daily total for a normal city trip (excl. flights & lodging) is usually well above a bare-minimum backpacker number. If yours looks low for the destination, raise it.
- Use REAL local prices for the destination, in the currency given below. Integers only, no currency symbols or thousands separators.
- perPerson: true unless the traveller clearly means the whole group's total.
- If they gave a per-day budget, set setBudget to that number and make summary say plainly whether the typical plan fits under it.
No preamble, no markdown.`;

/** The assistant's daily-spend estimate — the model sizes each category from real local prices. */
export async function buildBudgetBreakdown(input: {
  prompt: string;
  tripSummary: string;
  currency: string;
  statedDailyBudget?: number;
  evidence: RetrievedEvidence;
  tripCtx: Pick<TripContext, "places">;
  signal?: AbortSignal;
}): Promise<AssistantBlock | null> {
  const notes = input.evidence.sources.slice(0, 4).map((source) => `${source.title}: ${source.content.slice(0, 400)}`).join("\n");
  const doing = input.tripCtx.places
    .filter((entry) => entry.place?.name && entry.status !== "rejected")
    .slice(0, 10)
    .map((entry) => entry.place!.name)
    .join(", ");
  try {
    const raw = await gatewayFor("resolve").generateStructured(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Traveller: ${input.tripSummary}\nCurrency: ${input.currency}${input.statedDailyBudget ? `\nStated daily budget: ${input.statedDailyBudget} ${input.currency}` : ""}\nRequest: ${input.prompt}\nLikely doing: ${doing || "(open)"}\n\nWeb notes on local costs:\n${notes || "(none — use your own knowledge of the destination)"}`,
        },
      ],
      withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    );
    const parsed = budgetSchema.parse(raw);
    const sum = (key: "low" | "typical" | "high") => Math.round(parsed.lines.reduce((total, line) => total + line[key], 0));
    return {
      type: "budget",
      currency: parsed.currency,
      perPerson: parsed.perPerson,
      summary: parsed.summary,
      lines: parsed.lines.map((line) => ({
        category: line.category,
        low: Math.round(line.low),
        typical: Math.round(line.typical),
        high: Math.round(line.high),
        ...(line.note ? { note: line.note } : {}),
      })),
      dailyTotal: { low: sum("low"), typical: sum("typical"), high: sum("high") },
      ...(parsed.setBudget ? { setBudget: Math.round(parsed.setBudget) } : input.statedDailyBudget ? { setBudget: Math.round(input.statedDailyBudget) } : {}),
      ...(parsed.tripNote ? { tripNote: parsed.tripNote } : {}),
    };
  } catch {
    return null;
  }
}
