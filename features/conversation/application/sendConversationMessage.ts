import type { AssistantTurnMeta, ProposedCommand } from "@/packages/contracts/assistant";
import { streamAssistantResponse } from "./streamAssistantResponse";

export async function sendConversationMessage(input: {
  tripId: string;
  content: string;
  /** Name of whatever the user has open (a place/stay panel) so "there" / "this place" resolve. */
  viewContext?: string;
  /** Stable across retries of the SAME logical send — a fresh key on retry would let a message
   *  whose save actually succeeded (but whose response was lost) get persisted a second time. */
  idempotencyKey?: string;
  onSurfaceSelect?: (surface: string) => void;
  onProposal?: (proposal: ProposedCommand) => void;
  onUserSaved: () => void;
  onAssistantStart: (responseId: string) => void;
  onAssistantDelta: (content: string) => void;
  /** Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): real backend progress milestones.
   *  `label` is set on "retrieve" when RESOLVE planned a recognized tool ("finding places"). */
  onProgress?: (stage: "resolve" | "retrieve" | "compose", label?: string) => void;
  signal?: AbortSignal;
}): Promise<{ meta?: AssistantTurnMeta; content: string }> {
  // /api/ai persists the user's message itself as its first step (see streamAssistantResponse's
  // onUserSaved) — this used to be a separate round trip to /conversation made here first, purely
  // so that route could verify the message had already landed before it would proceed.
  const messageIdempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  // Deterministic from the turn's own idempotency key (not an unrelated random id) — lets
  // mergeConversationMessages match this placeholder to its own persisted row by key, the same
  // fix already applied to the user-message side of this same merge.
  const responseId = `local-assistant-${messageIdempotencyKey}`;
  input.onAssistantStart(responseId);
  const { content, meta } = await streamAssistantResponse(
    input.tripId,
    [{ role: "user", content: input.content }],
    input.onAssistantDelta,
    input.signal,
    messageIdempotencyKey,
    input.viewContext,
    input.onUserSaved,
    input.onProgress,
  );
  if (!content.trim() && !meta?.blocks?.length) throw new Error("Assistant returned an empty response");
  if (meta?.proposedCommand) input.onProposal?.(meta.proposedCommand);
  if (meta?.surface) input.onSurfaceSelect?.(meta.surface);
  return { meta, content };
}
