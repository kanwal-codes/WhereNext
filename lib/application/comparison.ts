import { z } from "zod";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { UsageEntry } from "@/lib/ai/pricing";
import { runBulkBuilder } from "./bulk-builder";
import type { RetrievedEvidence } from "./retrieve";
import { isGap } from "@/features/conversation/domain/comparisonView";

const comparisonSchema = z.object({
  title: z.string().trim().min(1).max(120),
  columns: z.array(z.string().trim().min(1).max(60)).min(2).max(6),
  rows: z.array(z.object({ label: z.string().trim().min(1).max(80), cells: z.array(z.string().trim().max(160)).min(2).max(6) })).min(2).max(6),
  bestForYou: z.object({ label: z.string().trim().min(1).max(80), reason: z.string().trim().min(1).max(240) }).nullable().default(null),
});

const SYSTEM = (language: string = "en") => `The user asked to compare options. Write every text field in language "${language}" (BCP-47). Return JSON only: {"title":"...","columns":["Option","attr1","attr2",...],"rows":[{"label":"<option name>","cells":["...","..."]}],"bestForYou":{"label":"<option>","reason":"..."}}.
- Compare the SPECIFIC things the user named (cities, neighbourhoods, hotels, activities). 2 to 4 options.
- First column header is "Option"; the row label is the option name; the first cell repeats the option name.
- 3 to 5 attribute columns that matter for THIS traveller (fit, cost, crowds, travel time, food, quiet, etc.). Choose ONLY attributes the evidence can actually fill for at least two options; a column nobody has facts for is left out, never filled with "unclear".
- Each cell is short and fact-first: under 70 characters, the number or the plain finding ("About $76 a day in hostels", "Walkable, 15 min between sights"). No hedging sentences, and never mention "the evidence", "sources" or "guides".
- Use the supplied evidence for facts. If one option has no fact for an attribute, write exactly "Unknown" for that cell; never invent a plausible-looking value.
- bestForYou: pick the option that fits the traveller's stated preferences and say why in one clause. null only if it is genuinely a toss-up.
No preamble.`;

const plain = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The places a comparison is really about: one per compared option, found by name among the places shown this turn, in the order
 * compared. Fewer than two matches means the options are not those places (two neighbourhoods compared while some bagel shops were
 * also found), and nothing is attached: the card shows the comparison itself rather than a table of unrelated places.
 */
export function comparedPlaceIds(rows: Array<{ label: string }>, shown: Array<{ providerId: string; name: string }>): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const label = plain(row.label.split(",")[0] ?? row.label);
    if (!label) continue;
    const match = shown.find((place) => { const name = plain(place.name); return name === label || (label.length >= 4 && (name.includes(label) || label.includes(name)) && name.length >= 4); });
    if (match && !ids.includes(match.providerId)) ids.push(match.providerId);
  }
  return ids.length >= 2 ? ids.slice(0, 4) : [];
}

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

/** A comparison where the attributes are mostly "unclear" tells the traveller nothing (live-caught: a card whose six cells all read "unclear"). Returns null when fewer than two options have anything to say. */
export function withoutEmptyComparison<T extends { label: string; cells: string[] }>(rows: T[]): T[] | null {
  const informative = rows.filter((row) => row.cells.slice(1).some((cell) => !isGap(cell)));
  if (informative.length < 2) return null;
  const known = informative.reduce((sum, row) => sum + row.cells.slice(1).filter((cell) => !isGap(cell)).length, 0);
  const total = informative.reduce((sum, row) => sum + row.cells.slice(1).length, 0);
  return known / total >= 0.5 ? informative : null;
}
