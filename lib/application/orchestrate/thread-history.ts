import type { AssistantTurnMeta } from "@/packages/contracts/assistant";

type Stored = { role: string; content: string; metadata?: unknown };
type Followup = { label: string; prompt: string };

/** The suggested next steps the most recent assistant message offered, if any. */
export function lastSuggestedFollowups(stored: Stored[]): Followup[] | undefined {
  const lastAssistantMessage = [...stored].reverse().find((message) => message.role === "assistant");
  return (lastAssistantMessage?.metadata as { suggestedFollowups?: Followup[] } | null)?.suggestedFollowups;
}

/**
 * The thread as the model sees it: user and assistant turns only, each cut to 8,000 characters.
 *
 * A short, referential reply ("book it", "do that one") only makes sense in light of
 * whatever the assistant itself just suggested — but `suggestedFollowups` lives in message
 * metadata, which this history otherwise drops entirely down to bare {role, content}. Found
 * live (2026-09-16): "book it", sent right after a "Book the tour in advance?" suggestion,
 * resolved to a generic "activities" intent that built an unrelated fresh itinerary instead
 * of recognizing what "it" referred to. Annotating the most recent assistant turn with its
 * own suggestions (label + the fuller natural-language prompt behind it) gives RESOLVE a
 * chance to actually match the reference, without touching the narrowly-scoped `clarify`
 * mechanism (reserved for a genuinely missing fact, not this).
 */
export function modelHistory(storedMessages: Stored[]): Array<{ role: "user" | "assistant"; content: string }> {
  const lastAssistantMessage = [...storedMessages].reverse().find((message) => message.role === "assistant");
  return storedMessages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const followups = message === lastAssistantMessage
        ? (message.metadata as { suggestedFollowups?: Followup[] } | null)?.suggestedFollowups
        : undefined;
      const content = followups?.length
        ? `${message.content.slice(0, 8_000)}\n\n[Suggested next steps shown to the user just now: ${followups.map((f) => `"${f.label}" (${f.prompt})`).join("; ")}]`
        : message.content.slice(0, 8_000);
      return { role: message.role as "user" | "assistant", content };
    });
}

/** Places (and hotels) already shown as cards earlier in this thread — so COMPOSE doesn't re-list them turn after turn. Derived from the persisted block metadata; no extra query. */
export function surfacedEarlierFrom(storedMessages: Stored[]): Set<string> {
  const surfacedEarlier = new Set<string>();
  for (const message of storedMessages) {
    const blocks = (message.metadata as { blocks?: AssistantTurnMeta["blocks"] } | null)?.blocks;
    for (const block of blocks ?? []) {
      if (block.type === "place_list") for (const place of block.places) surfacedEarlier.add(place.name);
      else if (block.type === "stays") for (const hotel of block.items) surfacedEarlier.add(hotel.name);
    }
  }
  return surfacedEarlier;
}
