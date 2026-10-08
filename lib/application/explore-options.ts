import { z } from "zod";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { UsageEntry } from "@/lib/ai/pricing";
import { runBulkBuilder } from "./bulk-builder";
import type { RetrievedEvidence } from "./retrieve";
import type { TripContext } from "./trip-context";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  blurb: z.string().trim().min(1).max(240),
  tags: z.array(z.string().trim().min(1).max(24)).max(4).default([]),
  meta: z.string().trim().max(60).optional(),
  bestFor: z.string().trim().max(80).optional(),
});
const optionsSchema = z.object({
  intro: z.string().trim().min(1).max(200),
  items: z.array(itemSchema).min(2).max(5),
});

const SYSTEM = (kind: "area" | "daytrip", language: string = "en") =>
  (kind === "area"
    ? `The traveller wants to know which NEIGHBOURHOODS / districts of the destination to base themselves in or spend their time. Return JSON only:
{"intro":"<ONE sentence naming your top pick and why>","items":[{"name":"<neighbourhood>","blurb":"<2 short sentences: the feel, what's there, who it suits>","tags":["walkable","nightlife","cafes"],"meta":"<e.g. central · walkable>","bestFor":"<short phrase>"}]}
- EXACTLY 3 real neighbourhoods of THIS city — the three that best fit the traveller, best first. Not more: this is a pick-one decision, not a catalogue.
- tags: 2 to 4 one-word tags. At least two should name something a traveller could look up there ("shopping", "bistros", "nightlife", "cafes", "museums", "parks", "views", "markets"); the card turns those into searches. Qualities like "walkable" or "central" can fill the rest.
- meta: 2 or 3 short facts joined by " · ", e.g. "central · walkable · metro hub". When the traveller's budget is tight or the notes say so, include what staying there costs compared with the other two ("pricier hotels", "better value").
- Ground it in the web notes + what you know of the city. No preamble.`
    : `The traveller wants DAY TRIPS out of the destination — places within ~2 hours to visit for a day and return. Return JSON only:
{"intro":"<ONE sentence naming your top pick and why>","items":[{"name":"<place>","blurb":"<2 short sentences: what it is, why go>","tags":["nature","historic"],"meta":"<travel time + mode, e.g. 1h15 by train>","bestFor":"<short phrase>"}]}
- 2 to 4 real destinations reachable from THIS city for a day. Order by appeal for the traveller.
- meta MUST be the realistic travel time and how (train / bus / car). Ground it in the web notes + what you know of the region. No preamble.`)
  + `\nWrite every text field in language "${language}" (BCP-47).`;

/** Neighbourhood guide or day-trip picks — the model chooses and describes the options. */
export async function buildExploreOptions(input: {
  kind: "area" | "daytrip";
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  tripCtx: Pick<TripContext, "preferences">;
  language?: string;
  signal?: AbortSignal;
  onUsage?: (entry: UsageEntry) => void;
}): Promise<AssistantBlock | null> {
  const notes = input.evidence.sources.slice(0, 4).map((source) => `${source.title}: ${source.content.slice(0, 400)}`).join("\n");
  // See budget-plan.ts's identical note: with no web research, the model falls back to general
  // knowledge (travel times, what a neighbourhood/day-trip is like), which must be marked as an
  // estimate rather than presented as sourced fact.
  const grounded = notes.trim().length > 0;
  const prefs = input.tripCtx.preferences as Record<string, unknown>;
  const likes = Array.isArray(prefs.likes) ? (prefs.likes as unknown[]).filter((v) => typeof v === "string").join(", ") : "";
  const parsed = await runBulkBuilder(
    SYSTEM(input.kind, input.language),
    `Traveller: ${input.tripSummary}${likes ? `\nLikes: ${likes}` : ""}\nRequest: ${input.prompt}\n\nWeb notes:\n${grounded ? notes : "(none — use your own general knowledge)"}`,
    optionsSchema,
    withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    input.onUsage,
  );
  if (!parsed) return null;
  return {
    type: "options",
    kind: input.kind,
    intro: parsed.intro,
    ...(grounded ? {} : { estimated: true }),
    // A neighbourhood pick is a decision, not a catalogue — hard-cap at 3 even if the model over-returns.
    items: parsed.items.slice(0, input.kind === "area" ? 3 : 4).map((item) => ({
      name: item.name,
      blurb: item.blurb,
      tags: item.tags.slice(0, 4),
      ...(item.meta ? { meta: item.meta } : {}),
      ...(item.bestFor ? { bestFor: item.bestFor } : {}),
    })),
  };
}
