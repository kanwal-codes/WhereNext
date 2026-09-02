import { z } from "zod";

/**
 * Trip facts the assistant can infer from the conversation but must NOT lock in.
 * Stored as `trip_decisions` rows of kind "suggestion" (one live row per key,
 * via idempotency_key "sugg:<key>"), shown in the trip-context panel as
 * "Suggested" until the user confirms.
 */
export const SUGGESTION_KEYS = [
  "dates",
  "occasion",
  "base_area",
  "getting_around",
  "arrival",
  "budget",
  "group",
  "pace",
  "interests",
] as const;
export type SuggestionKey = (typeof SUGGESTION_KEYS)[number];

export const SUGGESTION_LABEL: Record<SuggestionKey, string> = {
  dates: "Dates",
  occasion: "Occasion",
  base_area: "Base neighbourhood",
  getting_around: "Getting around",
  arrival: "Arrival",
  budget: "Budget",
  group: "Who's travelling",
  pace: "Pace",
  interests: "Interests",
};

export const suggestionValueSchema = z.object({
  key: z.enum(SUGGESTION_KEYS),
  display: z.string().trim().min(1).max(160),
  rationale: z.string().trim().max(240).default(""),
});
export type SuggestionValue = z.infer<typeof suggestionValueSchema>;

export const suggestionActionSchema = z.object({
  key: z.enum(SUGGESTION_KEYS),
  action: z.enum(["confirm", "dismiss"]),
});

type DecisionRow = { id?: string; kind: string; value: unknown; created_at?: string };

/** Extract the assistant's live suggestions from a decisions list — newest row per key. */
export function readSuggestions(decisions: ReadonlyArray<DecisionRow>): Array<SuggestionValue & { id?: string }> {
  const byKey = new Map<SuggestionKey, SuggestionValue & { id?: string; at: string }>();
  for (const row of decisions) {
    if (row.kind !== "suggestion") continue;
    const parsed = suggestionValueSchema.safeParse(row.value);
    if (!parsed.success) continue;
    const at = row.created_at ?? "";
    const existing = byKey.get(parsed.data.key);
    if (!existing || at >= existing.at) byKey.set(parsed.data.key, { ...parsed.data, id: row.id, at });
  }
  return [...byKey.values()].map(({ at: _at, ...rest }) => rest);
}
