/**
 * Phase 2.5 (docs/overhaul/roadmap/phase-2-speed.md,
 * docs/overhaul/chatbot-overhaul/turn-complexity-classifier.md) — the deterministic guard in
 * front of RESOLVE. Cerebras already gets full RESOLVE down to ~1s, so the only decision left
 * worth making before it is "does this need the pipeline at all," not a routine/complex split.
 */

export type TrivialKind = "greeting" | "thanks" | "farewell" | "acknowledgment";

// Deliberately small and hand-curated, not pattern-based — see the design doc for why growing
// this list is a known temptation to resist rather than a TODO. The kind each phrase carries is
// only used to pick a canned reply's wording (see `trivialReply` in run-turn.ts) — it has no
// bearing on which messages this file treats as trivial.
const TRIVIAL_PHRASES: Record<string, TrivialKind> = {
  hi: "greeting", hello: "greeting", hey: "greeting",
  thanks: "thanks", "thank you": "thanks", ty: "thanks",
  ok: "acknowledgment", okay: "acknowledgment", cool: "acknowledgment", nice: "acknowledgment",
  great: "acknowledgment", awesome: "acknowledgment", perfect: "acknowledgment",
  "sounds good": "acknowledgment", "got it": "acknowledgment", sure: "acknowledgment",
  yes: "acknowledgment", no: "acknowledgment",
  bye: "farewell", goodbye: "farewell", "see you": "farewell", later: "farewell",
};

/**
 * The trivial-phrase kind for a message, or null when it isn't one — matched only when the
 * ENTIRE message (trimmed, lowercased, trailing punctuation stripped) exact-matches one of the
 * fixed phrases above, never "starts with" or "contains". False "trivial" (a real question
 * wrongly skipped) is unacceptable; false "not trivial" (a genuine greeting that runs the full
 * pipeline anyway) just costs about a second. Exact match is what keeps "hi, what's a good
 * restaurant in Rome?" from misfiring.
 */
export function trivialTurnKind(message: string): TrivialKind | null {
  const normalized = message.trim().toLowerCase().replace(/[.!?]+$/, "");
  return TRIVIAL_PHRASES[normalized] ?? null;
}

export function isTrivialTurn(message: string): boolean {
  return trivialTurnKind(message) !== null;
}
