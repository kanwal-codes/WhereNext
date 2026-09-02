import { z } from "zod";
import { createAiGateway } from "@/packages/ai/gateway";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { RetrievedEvidence } from "./retrieve";

const comparisonSchema = z.object({
  title: z.string().trim().min(1).max(120),
  columns: z.array(z.string().trim().min(1).max(60)).min(2).max(6),
  rows: z.array(z.object({ label: z.string().trim().min(1).max(80), cells: z.array(z.string().trim().max(160)).min(2).max(6) })).min(2).max(6),
  bestForYou: z.object({ label: z.string().trim().min(1).max(80), reason: z.string().trim().min(1).max(240) }).nullable().default(null),
});

const SYSTEM = `The user asked to compare options. Return JSON only: {"title":"...","columns":["Option","attr1","attr2",...],"rows":[{"label":"<option name>","cells":["...","..."]}],"bestForYou":{"label":"<option>","reason":"..."}}.
- Compare the SPECIFIC things the user named (cities, neighbourhoods, hotels, activities). 2 to 4 options.
- First column header is "Option"; the row label is the option name; the first cell repeats the option name.
- 3 to 5 attribute columns that matter for THIS traveller (fit, cost, crowds, travel time, food, quiet, etc.).
- Use the supplied evidence for facts; if unknown, write "unclear".
- bestForYou: pick the option that fits the traveller's stated preferences and say why in one clause. null only if it is genuinely a toss-up.
No preamble.`;

/** Phase 6-quality comparison block: the model decides what is being compared and on which attributes. */
export async function buildComparison(input: {
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  signal?: AbortSignal;
}): Promise<AssistantBlock | null> {
  const evidenceText = [
    ...input.evidence.places.slice(0, 8).map((place) => `${place.name} (${place.category ?? "place"}${place.rating ? `, ${place.rating}★` : ""})`),
    ...input.evidence.sources.slice(0, 3).map((source) => `${source.title}: ${source.content.slice(0, 300)}`),
  ].join("\n");
  try {
    const raw = await createAiGateway({ model: process.env.RESOLVE_MODEL || undefined }).generateStructured(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Traveller: ${input.tripSummary}\nRequest: ${input.prompt}\nEvidence:\n${evidenceText || "(none)"}` },
      ],
      input.signal,
    );
    const parsed = comparisonSchema.parse(raw);
    return { type: "comparison", title: parsed.title, columns: parsed.columns, rows: parsed.rows, bestForYou: parsed.bestForYou };
  } catch {
    return null;
  }
}
