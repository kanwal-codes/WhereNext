import { z } from "zod";
import { gatewayFor } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { RetrievedEvidence } from "./retrieve";

const checklistSchema = z.object({
  groups: z.array(z.object({
    title: z.string().trim().min(1).max(80),
    items: z.array(z.object({ text: z.string().trim().min(1).max(200), why: z.string().trim().max(200).optional() })).min(1).max(8),
  })).min(1).max(8),
});

const SYSTEM = `You produce a practical, trip-specific readiness checklist as JSON only: {"groups":[{"title":"...","items":[{"text":"...","why":"..."}]}]}.
Cover only what matters for THIS trip and its dates and activities. Reasonable groups: Packing, Documents & entry, Money, Connectivity, Getting around, Customs & dress, Safety, Language.
Rules:
- Use the supplied evidence for facts (weather, what the place is known for). If you are not sure of a visa rule, currency, or price, say "check the official source" in "why" - never assert a specific rule or number you cannot support.
- Each item is one short action. "why" is one short clause tying it to the weather, an activity, the season, or a stated need.
- 3 to 6 groups, 2 to 5 items each. No preamble.`;

/** Phase 5: build the essentials `checklist` block for an essentials-intent turn. */
export async function buildEssentialsChecklist(input: {
  destination: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  signal?: AbortSignal;
}): Promise<AssistantBlock | null> {
  const evidenceText = [
    input.evidence.weather ? `Weather: ${input.evidence.weather}` : "",
    ...input.evidence.sources.slice(0, 4).map((source) => `${source.title}: ${source.content.slice(0, 400)}`),
  ].filter(Boolean).join("\n");
  try {
    const raw = await gatewayFor("resolve").generateStructured(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Destination: ${input.destination}\nTrip so far: ${input.tripSummary}\nEvidence:\n${evidenceText || "(none)"}` },
      ],
      input.signal,
    );
    const parsed = checklistSchema.parse(raw);
    return { type: "checklist", groups: parsed.groups };
  } catch {
    return null;
  }
}
