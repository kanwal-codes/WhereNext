import type { AssistantBlock } from "@/packages/contracts/assistant";

type Followup = { label: string; prompt: string };

/** "Toronto, Ontario, Canada" -> "Toronto". */
const short = (place: string | null) => place?.split(",")[0]?.trim() || null;

/**
 * What Roam says when a lookup came back empty. Instead of a dead end ("the data providers returned nothing"), it says what happened in
 * plain words, that trying again is reasonable, and offers concrete next asks as chips (the traveller's own followups when RESOLVE
 * produced some, else three generic ones for the place).
 */
export function ungroundedFallback(locationFocus: string | null, followups: Followup[]): { content: string; actions: AssistantBlock | null } {
  const place = short(locationFocus);
  const content = place
    ? `I couldn't pull up solid results for ${place} just now. That can be a hiccup on my side, so try again in a moment, or ask for something specific.`
    : "I couldn't pull up solid results for that just now. That can be a hiccup on my side, so try again in a moment, or ask for something more specific.";
  const items: Followup[] = followups.length > 0
    ? followups.slice(0, 4)
    : place
      ? [
          { label: `Things to do in ${place}`, prompt: `What are the best things to do in ${place}?` },
          { label: "Places to eat", prompt: `Where should we eat in ${place}?` },
          { label: "Where to stay", prompt: `Where should we stay in ${place}?` },
        ]
      : [];
  return { content, actions: items.length > 0 ? ({ type: "actions", items } as AssistantBlock) : null };
}
