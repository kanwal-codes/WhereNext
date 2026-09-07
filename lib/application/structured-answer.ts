import { z } from "zod";
import { AI_DEADLINE_MS, gatewayFor, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { RetrievedEvidence } from "./retrieve";

const answerSchema = z.object({
  intro: z.string().trim().min(1).max(200),
  sections: z.array(z.object({
    heading: z.string().trim().min(1).max(80),
    bullets: z.array(z.object({
      text: z.string().trim().min(1).max(200),
      detail: z.string().trim().max(200).optional(),
    })).min(1).max(6),
  })).min(1).max(5),
});

const SYSTEM = `Answer the traveller's question as a tidy set of sections, from the web notes provided. Return JSON only:
{"intro":"<ONE sentence framing the answer>","sections":[{"heading":"<short>","bullets":[{"text":"<the point>","detail":"<optional: a number, a caveat, a how-to>"}]}]}
Rules:
- 1 to 4 sections, 2 to 5 bullets each. Group logically (e.g. for "how does the metro work": Fares, Passes, Hours, Tips).
- text = the point itself, short. detail = an optional second clause (a price, a time, a caveat) — omit if there's nothing to add.
- Use the web notes for specifics; if a detail isn't in them, leave it out rather than guessing.
- No markdown, no preamble.`;

/** The long-tail catch: a clean sectioned card for "how X works" / "local customs" / "things to know". */
export async function buildStructuredAnswer(input: {
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  signal?: AbortSignal;
}): Promise<AssistantBlock | null> {
  const notes = input.evidence.sources.slice(0, 5).map((source) => `${source.title}: ${source.content.slice(0, 500)}`).join("\n");
  if (notes.trim().length < 60) return null;
  try {
    const raw = await gatewayFor("resolve").generateStructured(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Traveller: ${input.tripSummary}\nQuestion: ${input.prompt}\n\nWeb notes:\n${notes}` },
      ],
      withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    );
    const parsed = answerSchema.parse(raw);
    return {
      type: "structured_answer",
      intro: parsed.intro,
      sections: parsed.sections.map((section) => ({
        heading: section.heading,
        bullets: section.bullets.map((bullet) => ({
          text: bullet.text,
          ...(bullet.detail ? { detail: bullet.detail } : {}),
        })),
      })),
    };
  } catch {
    return null;
  }
}
