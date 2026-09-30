import { z } from "zod";
import type { UsageEntry } from "@/lib/ai/pricing";
import { runBulkBuilder } from "./bulk-builder";
import { sanitizeAssistantContent } from "./sanitize-assistant";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import { logger } from "@/lib/server/logger";

/**
 * Phase 3.1 (docs/overhaul/roadmap/phase-3-accuracy.md) — the evaluator-optimizer pattern
 * (docs/overhaul/chatbot-overhaul/accuracy-and-grounding.md): a second, cheap model pass that
 * checks a drafted answer's factual claims against the actual RETRIEVE evidence, catching a
 * wrong claim of any kind (a wrong neighborhood, a wrong opening day) — not just an unverified
 * price, which is all `sanitizeAssistantContent`'s regex can catch.
 *
 * Proven in isolation first (`evaluateGrounding` against `scripts/smoke-test-evaluator.ts`'s
 * hand-built live test set, per the roadmap's Phase 3.1 gate) before `finalizeAssistantText`
 * below wired it into both `app/api/ai/route.ts` and the group-chat @Roam route (Phase 3.2).
 */

const evaluationSchema = z.object({
  // Each entry is a short, EXACT substring quoted verbatim from the draft — not a paraphrase or
  // summary of the problem — so the caller can confirm it genuinely appears in the reply before
  // treating the turn as flagged (`hasUnsupportedClaim`). Never rewritten into the text itself —
  // see that function's doc comment for why in-place substitution was retired.
  unsupportedClaims: z.array(z.string().trim().min(1).max(300)).max(10),
});
export type GroundingEvaluation = z.infer<typeof evaluationSchema>;

const SYSTEM = `You fact-check a drafted travel-assistant answer against the evidence it was supposed to be grounded in.

Flag a claim ONLY if it is a SPECIFIC, CHECKABLE OPERATIONAL OR COMMERCIAL fact about a business or venue — a price, a business/place name, an opening day or hours, a rating, a specific neighbourhood or address, a booking-relevant date — that is NOT supported by the evidence, either absent from it entirely or contradicted by it. This tool exists to catch fabricated business-specific details (an invented price, wrong hours, a rating that isn't in evidence), not to fact-check the world and not to police how much descriptive detail the answer gives about what a place looks like, is famous for, or its history. A claim describing a landmark's appearance, atmosphere, artistic/architectural features, or well-known history/trivia is NEVER in scope here, no matter how specific or detailed it reads — "checkable" in this instruction means checkable against a business listing (price, hours, rating, address), not checkable-in-principle-by-someone-with-a-history-book.

Do NOT flag:
- General travel advice, opinions, or subjective descriptions ("charming", "worth a visit").
- Hedged language ("might", "usually", "around", "roughly") describing something genuinely in the evidence.
- A reasonable paraphrase or rounding of a real figure in the evidence (e.g. evidence says "$42-58", answer says "around $50").
- Anything the evidence directly supports, even loosely.
- Widely known, uncontroversial facts that don't need real-time verification (a country a city is in, a well-known landmark's general location, a widely known historical fact, basic geography) — these are true regardless of what the retrieved evidence happens to cover, so their absence from it is not evidence of a problem. This explicitly includes: a famous, well-documented event or person associated with a landmark (a celebrity wedding, a historic ceremony, who designed or built it, when it opened) EVEN IF IT ALSO sounds like "a specific, checkable fact about a venue" and even if it also involves a date — a landmark's own famous history is common knowledge, not a business claim that needs a live evidence match; and a landmark's well-known visual/architectural description (materials, colours, style, notable features) — this is the kind of description any travel guide states confidently from general knowledge, not a fabricated specific like an invented price, phone number, or hours. Live-caught failures: "Celine Dion's wedding" (a real, famous, widely reported event at Notre-Dame Basilica) and a description of the basilica's actual blue star-studded ceiling were both wrongly flagged — neither is a fabrication or a business claim needing live verification, both are exactly the kind of general knowledge this bullet exists to exclude.
- A number or fact about the TRAVELLER'S OWN trip — their budget, traveller count, dates, dietary/accessibility needs, or any other preference — even when it reads like a price or a specific figure. Those aren't claims about a business or venue to verify against evidence; they're the assistant acknowledging something the traveller stated themselves, which this evaluator never sees the traveller's own message to check against in the first place. Live-caught failure: "$2000 total for the trip" flagged as unsupported and replaced with "something I couldn't fully verify" — inside a sentence that was just confirming the traveller's own correction back to them, produced a confusing non-sequitur.

For each flagged claim, quote the EXACT substring from the drafted answer (verbatim, character-for-character) — not a description of the problem. This is never edited into the reply, only checked for whether it actually appears — so quote whatever span most precisely IS the unsupported claim (typically just the value itself, e.g. "$60–90/day" or "a 4.9 rating"), verbatim.
If nothing is unsupported, return an empty list. Return JSON only: {"unsupportedClaims":["<exact quoted substring>", ...]}`;

/**
 * `evidence` — the same grounding text `sanitizeAssistantContent` already takes (the turn's
 * compacted evidence/trip-context, as sent to COMPOSE) — kept as a plain string rather than the
 * structured `RetrievedEvidence` type so this can be reused with any grounding text a caller
 * already has, exactly like the sanitizer.
 */
export async function evaluateGrounding(
  draft: string,
  evidence: string,
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
): Promise<GroundingEvaluation> {
  const parsed = await runBulkBuilder(SYSTEM, `Evidence:\n${evidence}\n\nDrafted answer:\n${draft}`, evaluationSchema, signal, onUsage);
  // A failed/degraded evaluator call must never block or alter a turn — same fail-open
  // philosophy as every other side-builder in this pipeline (`runBulkBuilder` already returns
  // `null` on any error, never throws).
  return parsed ?? { unsupportedClaims: [] };
}

/**
 * Phase 3.2.1 ORIGINALLY did in-place text substitution — replacing a flagged claim's exact
 * quoted span with a generic hedge phrase, directly inside the sentence. Retired after THREE
 * separate live bugs, each a different way a bare string-replace can't grammar-proof an
 * arbitrary surrounding sentence: a dropped leading article ("in the something I couldn't fully
 * verify"), a dropped leading preposition ("a well-rated cocktail bar something I couldn't fully
 * verify"), and a dropped linking verb ("Typical daily spend something I couldn't fully verify").
 * Each got its own prompt patch telling the evaluator to quote spans more carefully; each patch
 * held until the next sentence shape broke it a different way. No amount of "quote it exactly
 * right" instruction to the flagging model can fully guarantee the RESULT stays grammatical for
 * every possible sentence — the fix is to stop editing the prose at all.
 *
 * So: the reply is now shown completely UNTOUCHED, exactly as COMPOSE wrote it. This just decides
 * whether at least one flagged claim actually appears verbatim in it (the model occasionally
 * misquotes something that isn't there, which should never trigger a caveat over nothing) — the
 * caller surfaces that as a separate `unverified` meta flag, rendered as one small, clearly
 * distinct line below the message (see `ConversationSurface.tsx`'s existing `degraded`/
 * `truncated` lines for the identical pattern) instead of a mid-sentence rewrite.
 */
export function hasUnsupportedClaim(content: string, claims: string[]): boolean {
  return claims.some((claim) => content.includes(claim));
}

/**
 * Phase 3.2.2 mitigation (a) (docs/overhaul/roadmap/phase-3-accuracy.md): intents where a
 * fabricated BUSINESS/venue claim — the one thing this evaluator actually looks for, per its own
 * SYSTEM prompt above — is essentially impossible by construction. `chitchat` has no business
 * content to fabricate in the first place; `trip_memory` only ever echoes the trip's own
 * already-confirmed data (destination, dates, saved places) back to the user, never introducing a
 * new, unverified claim. Skipping the evaluator's real model round-trip for these two (common,
 * high-frequency, low-risk) intents saves real latency without weakening the actual protection —
 * the regex sanitizer below still runs regardless of intent. Deliberately a short, conservative
 * denylist rather than an allowlist: excluding a genuinely risky intent by mistake is a much worse
 * failure mode than occasionally evaluating a turn that didn't strictly need it.
 */
const SKIP_EVALUATOR_INTENTS = new Set(["chitchat", "trip_memory"]);

/**
 * The full Phase 3.2 finalize step for a COMPOSE-drafted reply: the existing regex sanitizer
 * first (cheap, catches unverified money figures and un-allow-listed links), then the grounding
 * evaluator (broader, catches any kind of unsupported factual claim) — both against the same
 * `groundingText` the sanitizer already used alone.
 *
 * Bounded TWICE, deliberately redundant: `AbortSignal.timeout` (via `withDeadline`, passed into
 * the model call so a well-behaved provider request actually gets cancelled) AND a plain
 * `Promise.race` wall-clock timer (mirroring `app/api/ai/route.ts`'s own `withTtft` for COMPOSE).
 * Live testing found the AbortSignal alone insufficient: the bulk chain's Cerebras-pinned lead
 * occasionally erred slowly, and the AI SDK's own internal retry/backoff on the fallback attempt
 * didn't reliably honor an already-fired abort signal — real observed wall-clock times of 8-10s
 * even with a 4s `AbortSignal.timeout` in place (see docs/overhaul/roadmap/phase-3-accuracy.md
 * sub-phase 3.2.2). The `Promise.race` guarantees the CALLER never waits past the deadline
 * regardless of what the abandoned in-flight call does afterward — same fail-open contract
 * either way (a timeout here means "couldn't verify in time," never "answer is wrong").
 *
 * `intent` is optional (a caller without RESOLVE's intent taxonomy — e.g. compare-chat — simply
 * always evaluates, exactly as before this parameter existed).
 *
 * `onUnverified` (optional, mirrors `onUsage`'s callback shape) fires once if the evaluator
 * flagged a claim that's genuinely present in the returned text — the caller's own signal to set
 * the `unverified` meta flag. The text itself is returned exactly as sanitized, never rewritten
 * for this; see `hasUnsupportedClaim`'s doc comment for why in-place editing was retired.
 */
export async function finalizeAssistantText(
  content: string,
  allowedUrls: ReadonlySet<string>,
  groundingText: string,
  signal?: AbortSignal,
  onUsage?: (entry: UsageEntry) => void,
  intent?: string,
  onUnverified?: () => void,
  userText?: string,
): Promise<string> {
  const sanitized = sanitizeAssistantContent(content, allowedUrls, groundingText, userText);
  if (intent && SKIP_EVALUATOR_INTENTS.has(intent)) return sanitized;
  const deadline = withDeadline(signal, AI_DEADLINE_MS.groundingEvaluator);
  const timedOut: GroundingEvaluation = { unsupportedClaims: [] };
  const evaluation = await Promise.race([
    // What the traveller wrote is evidence too: a figure they gave and Roam repeated is not an unverified estimate.
    evaluateGrounding(sanitized, userText ? `${groundingText}\n\nThe traveller's own messages (figures they stated are supported):\n${userText}` : groundingText, deadline, onUsage),
    new Promise<GroundingEvaluation>((resolve) => setTimeout(() => resolve(timedOut), AI_DEADLINE_MS.groundingEvaluator)),
  ]);
  if (hasUnsupportedClaim(sanitized, evaluation.unsupportedClaims)) {
    logger.debug({ unsupportedClaims: evaluation.unsupportedClaims }, "grounding evaluator flagged a claim");
    onUnverified?.();
  }
  return sanitized;
}
