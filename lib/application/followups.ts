import type { AssistantBlock } from "@/packages/contracts/assistant";

type Chip = { label: string; prompt: string };

const CANT_BOOK = /\b(?:can(?:no|')t|unable to|not able to)\s+(?:complete\s+|make\s+|do\s+)?(?:a\s+|any\s+)?(?:book|reserv)/i;
const BOOKING_CHIP = /^\s*(?:book|reserve|buy)\b/i;
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Follow-up chips are chosen before the reply is written, so they can repeat the previous turn's
 * chips or offer what the reply just ruled out ("Book the hotel" under "I can't complete a booking").
 * Drops exactly those two cases once the final text is known; everything else is left alone.
 */
export function pruneFollowups(chips: Chip[], replyText: string, previous: Chip[] = []): Chip[] {
  const seen = new Set(previous.map((c) => norm(c.label)));
  const noBooking = CANT_BOOK.test(replyText);
  return chips
    .filter((c) => !seen.has(norm(c.label)) && !(noBooking && (BOOKING_CHIP.test(c.label) || BOOKING_CHIP.test(c.prompt))))
    .map(softenBooking);
}

/** Roam cannot book anything, so a chip never says "Book …": it offers to find it ("Book Tenement Museum tickets" → "Find Tenement Museum tickets"). */
export function softenBooking(chip: Chip): Chip {
  const soften = (text: string) => text.replace(BOOKING_CHIP, (match) => (match.startsWith(" ") ? " " : "") + "Find");
  return BOOKING_CHIP.test(chip.label) ? { label: soften(chip.label), prompt: soften(chip.prompt) } : chip;
}

/** Applies `pruneFollowups` to a finished turn's meta: both the chip list and the `actions` block built from it. */
export function withPrunedFollowups<M extends { suggestedFollowups: Chip[]; blocks: AssistantBlock[] }>(meta: M, replyText: string, previous?: Chip[]): M {
  const kept = pruneFollowups(meta.suggestedFollowups, replyText, previous);
  if (kept.length === meta.suggestedFollowups.length) return meta;
  const blocks: AssistantBlock[] = [];
  for (const b of meta.blocks) {
    if (b.type !== "actions") blocks.push(b);
    else if (kept.length) blocks.push({ ...b, items: kept });
  }
  return { ...meta, suggestedFollowups: kept, blocks };
}
