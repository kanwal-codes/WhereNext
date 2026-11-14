import { generateText } from "@/packages/ai/model-policy";
import { withDeadline } from "@/packages/ai/model-policy";
import type { UsageEntry } from "@/lib/ai/pricing";

/** "Toronto, Ontario, Canada" reads as "Toronto" in a sentence. */
export const cityOf = (destination?: string | null) => destination?.split(",")[0]?.trim() || "";

export type DeclineKind = "injection" | "translate" | "homework" | "opinion" | "other";

const INJECTION = /\b(ignore|disregard|forget)\b.{0,30}\b(instructions?|rules|prompt)\b|\b(system|hidden|initial) (prompt|instructions?)\b|\b(reveal|print|show|repeat)\b.{0,25}\b(your|the) (prompt|instructions?|rules)\b/i;
const TRANSLATE = /\btranslat(e|ion)\b/i;
const HOMEWORK = /\b(python|javascript|typescript|code|function|regex|sql|equation|solve|calculate|essay|homework|poem|story about)\b|\d\s*[x+*/^=-]\s*\d/i;
const OPINION = /\b(vote|election|politic\w*|president|prime minister|religion|abortion|gun control)\b/i;

/** What kind of out-of-scope message this is, so the decline can say something fitting instead of one line for everything. */
export function declineKind(prompt: string): DeclineKind {
  if (INJECTION.test(prompt)) return "injection";
  if (TRANSLATE.test(prompt)) return "translate";
  if (OPINION.test(prompt)) return "opinion";
  if (HOMEWORK.test(prompt)) return "homework";
  return "other";
}

/** English wording of the decline: names the limit in a clause, then points at the nearest thing Roam can do. Never a bare refusal. */
export function declineReply(prompt: string, destination?: string | null): string {
  const city = cityOf(destination);
  const trip = city ? `your ${city} trip` : "your trip";
  switch (declineKind(prompt)) {
    case "injection":
      return `I'll keep my setup to myself. I'm happy to carry on with ${trip}, though. Where would you like to pick up?`;
    case "translate":
      return `I can't translate documents or messages, but I can give you the phrases you'll actually use${city ? ` in ${city}` : ""}: greetings, ordering food, asking the way. Want those?`;
    case "homework":
      return `That one's outside what I do here, so I won't attempt it. For ${trip} I can help with places, food, getting around and what to book.`;
    case "opinion":
      return `I'll stay out of that one. For ${trip}, ask me about places, food, getting around or what to book.`;
    default:
      return `That's outside what I can help with here. For ${trip}, I'm your person for places, food, getting around and what to book.`;
  }
}

/** The decline in the traveller's own language. Only our own fixed English sentence is translated, never the traveller's message,
 *  so nothing they wrote can steer the model; any failure or a slow call falls back to the English wording. */
export async function declineText(input: { prompt: string; destination?: string | null; language: string; signal?: AbortSignal; onUsage?: (entry: UsageEntry) => void }): Promise<string> {
  const english = declineReply(input.prompt, input.destination);
  if (!input.language || input.language.toLowerCase().startsWith("en")) return english;
  try {
    // The stronger router model, not the cheap bulk one: a decline is rare and a half-English sentence in it reads as broken.
    const translated = await generateText(
      "resolve",
      [
        { role: "system", content: `Translate the text into the language with BCP-47 code "${input.language}". Keep it warm, short and natural, in the script that code names, with place names as people write them in that language. Output only the translated sentences, nothing else, no notes.` },
        { role: "user", content: english },
      ],
      withDeadline(input.signal, 5_000),
      input.onUsage,
    );
    // The reply is one short paragraph: anything the model adds after a blank line (a note about its own translation) is dropped.
    return translated.trim().split(/\n\s*\n/)[0]?.trim() || english;
  } catch {
    return english;
  }
}
