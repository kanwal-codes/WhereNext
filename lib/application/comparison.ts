import { z } from "zod";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { UsageEntry } from "@/lib/ai/pricing";
import { runBulkBuilder } from "./bulk-builder";
import type { RetrievedEvidence } from "./retrieve";

const comparisonSchema = z.object({
  title: z.string().trim().min(1).max(120),
  columns: z.array(z.string().trim().min(1).max(60)).min(2).max(6),
  rows: z.array(z.object({ label: z.string().trim().min(1).max(80), cells: z.array(z.string().trim().max(160)).min(2).max(6) })).min(2).max(6),
  bestForYou: z.object({ label: z.string().trim().min(1).max(80), reason: z.string().trim().min(1).max(240) }).nullable().default(null),
});

const SYSTEM = (language: string = "en") => `The user asked to compare options. Write every text field in language "${language}" (BCP-47). Return JSON only: {"title":"...","columns":["Option","attr1","attr2",...],"rows":[{"label":"<option name>","cells":["...","..."]}],"bestForYou":{"label":"<option>","reason":"..."}}.
- Compare the SPECIFIC things the user named (cities, neighbourhoods, hotels, activities). 2 to 4 options.
- First column header is "Option"; the row label is the option name; the first cell repeats the option name.
- 3 to 5 attribute columns that matter for THIS traveller (fit, cost, crowds, travel time, food, quiet, etc.).
- Use the supplied evidence for facts; if unknown, write "unclear" — never invent a plausible-looking value.
- bestForYou: pick the option that fits the traveller's stated preferences and say why in one clause. null only if it is genuinely a toss-up.
No preamble.`;

/** Phase 6-quality comparison block: the model decides what is being compared and on which attributes. */
export async function buildComparison(input: {
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  language?: string;
  signal?: AbortSignal;
  onUsage?: (entry: UsageEntry) => void;
}): Promise<AssistantBlock | null> {
  const evidenceText = [
    ...input.evidence.places.slice(0, 8).map((place) => `${place.name} (${place.category ?? "place"}${place.rating ? `, ${place.rating}★` : ""})`),
    ...input.evidence.sources.slice(0, 3).map((source) => `${source.title}: ${source.content.slice(0, 300)}`),
  ].join("\n");
  const parsed = await runBulkBuilder(
    SYSTEM(input.language),
    `Traveller: ${input.tripSummary}\nRequest: ${input.prompt}\nEvidence:\n${evidenceText || "(none)"}`,
    comparisonSchema,
    withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    input.onUsage,
  );
  if (!parsed) return null;
  const rows = withoutEmptyComparison(parsed.rows);
  if (!rows) return null;
  return { type: "comparison", title: parsed.title, columns: parsed.columns, rows, bestForYou: parsed.bestForYou };
}

const UNKNOWN = /^(?:unclear|unknown|n\/a|—|-|not (?:available|stated|known))\.?$/i;

/** A comparison where the attributes are mostly "unclear" tells the traveller nothing (live-caught: a card whose six cells all read "unclear"). Returns null when fewer than two options have anything to say. */
export function withoutEmptyComparison<T extends { label: string; cells: string[] }>(rows: T[]): T[] | null {
  const informative = rows.filter((row) => row.cells.slice(1).some((cell) => cell.trim() && !UNKNOWN.test(cell.trim())));
  if (informative.length < 2) return null;
  const known = informative.reduce((sum, row) => sum + row.cells.slice(1).filter((cell) => cell.trim() && !UNKNOWN.test(cell.trim())).length, 0);
  const total = informative.reduce((sum, row) => sum + row.cells.slice(1).length, 0);
  return known / total >= 0.5 ? informative : null;
}
