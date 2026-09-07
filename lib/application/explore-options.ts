import { z } from "zod";
import { AI_DEADLINE_MS, gatewayFor, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
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

const SYSTEM = (kind: "area" | "daytrip") =>
  kind === "area"
    ? `The traveller wants to know which NEIGHBOURHOODS / districts of the destination to base themselves in or spend their time. Return JSON only:
{"intro":"<ONE sentence naming your top pick and why>","items":[{"name":"<neighbourhood>","blurb":"<2 short sentences: the feel, what's there, who it suits>","tags":["walkable","nightlife","cafes"],"meta":"<e.g. central · walkable>","bestFor":"<short phrase>"}]}
- EXACTLY 3 real neighbourhoods of THIS city — the three that best fit the traveller, best first. Not more: this is a pick-one decision, not a catalogue.
- tags: 2 to 4 one-word vibes. Ground it in the web notes + what you know of the city. No preamble.`
    : `The traveller wants DAY TRIPS out of the destination — places within ~2 hours to visit for a day and return. Return JSON only:
{"intro":"<ONE sentence naming your top pick and why>","items":[{"name":"<place>","blurb":"<2 short sentences: what it is, why go>","tags":["nature","historic"],"meta":"<travel time + mode, e.g. 1h15 by train>","bestFor":"<short phrase>"}]}
- 2 to 4 real destinations reachable from THIS city for a day. Order by appeal for the traveller.
- meta MUST be the realistic travel time and how (train / bus / car). Ground it in the web notes + what you know of the region. No preamble.`;

/** Neighbourhood guide or day-trip picks — the model chooses and describes the options. */
export async function buildExploreOptions(input: {
  kind: "area" | "daytrip";
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  tripCtx: Pick<TripContext, "preferences">;
  signal?: AbortSignal;
}): Promise<AssistantBlock | null> {
  const notes = input.evidence.sources.slice(0, 4).map((source) => `${source.title}: ${source.content.slice(0, 400)}`).join("\n");
  const prefs = input.tripCtx.preferences as Record<string, unknown>;
  const likes = Array.isArray(prefs.likes) ? (prefs.likes as unknown[]).filter((v) => typeof v === "string").join(", ") : "";
  try {
    const raw = await gatewayFor("resolve").generateStructured(
      [
        { role: "system", content: SYSTEM(input.kind) },
        {
          role: "user",
          content: `Traveller: ${input.tripSummary}${likes ? `\nLikes: ${likes}` : ""}\nRequest: ${input.prompt}\n\nWeb notes:\n${notes || "(none — use your own knowledge)"}`,
        },
      ],
      withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    );
    const parsed = optionsSchema.parse(raw);
    return {
      type: "options",
      kind: input.kind,
      intro: parsed.intro,
      // A neighbourhood pick is a decision, not a catalogue — hard-cap at 3 even if the model over-returns.
      items: parsed.items.slice(0, input.kind === "area" ? 3 : 4).map((item) => ({
        name: item.name,
        blurb: item.blurb,
        tags: item.tags.slice(0, 4),
        ...(item.meta ? { meta: item.meta } : {}),
        ...(item.bestFor ? { bestFor: item.bestFor } : {}),
      })),
    };
  } catch {
    return null;
  }
}
