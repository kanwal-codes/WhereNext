import { z } from "zod";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { UsageEntry } from "@/lib/ai/pricing";
import { runBulkBuilder } from "./bulk-builder";
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

const SYSTEM = (language: string = "en") => `Answer the traveller's question as a tidy set of sections, from the web notes provided. Write every text field in language "${language}" (BCP-47). Return JSON only:
{"intro":"<ONE sentence framing the answer>","sections":[{"heading":"<short>","bullets":[{"text":"<the point>","detail":"<optional: a number, a caveat, a how-to>"}]}]}
Rules:
- 1 to 4 sections, 2 to 5 bullets each. Group logically (e.g. for "how does the metro work": Fares, Passes, Hours, Tips).
- text = the point itself, short. detail = an optional second clause (a price, a time, a caveat) — omit if there's nothing to add.
- For practical facts (plug type, voltage, currency, tipping, emergency number, tap water, SIM), make each bullet a fact name in text and its value in detail ("Plug type" / "Type G, 230 V"), so the card can show them as a fact list.
- If the question names several topics, cover each one the notes answer; for a topic they do not answer, leave it out and say so in the intro in plain words ("I couldn't find reliable tipping details"), never mentioning "notes".
- Use the web notes for specifics; if a detail isn't in them, leave it out rather than guessing — never invent a plausible-looking number.
- No markdown, no preamble.`;

/** The long-tail catch: a clean sectioned card for "how X works" / "local customs" / "things to know". */
export async function buildStructuredAnswer(input: {
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  language?: string;
  signal?: AbortSignal;
  onUsage?: (entry: UsageEntry) => void;
}): Promise<AssistantBlock | null> {
  const notes = input.evidence.sources.slice(0, 15).map((source) => `${source.title}: ${source.content.slice(0, 550)}`).join("\n");
  if (notes.trim().length < 60) return null;
  const parsed = await runBulkBuilder(
    SYSTEM(input.language),
    `Traveller: ${input.tripSummary}\nQuestion: ${input.prompt}\n\nWeb notes:\n${notes}`,
    answerSchema,
    withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    input.onUsage,
  );
  if (!parsed) return null;
  const sections = parsed.sections
    .map((section) => ({
      heading: section.heading,
      // A bare label with nothing after it ("Currency", "Tipping") says nothing: the notes had no answer for it.
      bullets: section.bullets
        .filter((bullet) => bullet.detail || bullet.text.trim().split(/\s+/).length > 3)
        .map((bullet) => ({ text: bullet.text, ...(bullet.detail ? { detail: bullet.detail } : {}) })),
    }))
    .filter((section) => section.bullets.length > 0);
  if (sections.length === 0) return null;
  return { type: "structured_answer", intro: parsed.intro, sections };
}
