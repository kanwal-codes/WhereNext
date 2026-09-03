import type { AssistantTurnMeta, ProposedCommand } from "@/packages/contracts/assistant";
import { persistUserMessage } from "./conversationActions";
import { streamAssistantResponse } from "./streamAssistantResponse";

export async function sendConversationMessage(input: {
  tripId: string;
  content: string;
  /** Name of whatever the user has open (a place/stay panel) so "there" / "this place" resolve. */
  viewContext?: string;
  onSurfaceSelect?: (surface: string) => void;
  onProposal?: (proposal: ProposedCommand) => void;
  onUserSaved: () => void;
  onAssistantStart: (responseId: string) => void;
  onAssistantDelta: (content: string) => void;
  signal?: AbortSignal;
}): Promise<{ meta?: AssistantTurnMeta; content: string }> {
  const messageIdempotencyKey = await persistUserMessage(input.tripId, input.content, crypto.randomUUID());
  input.onUserSaved();
  const responseId = crypto.randomUUID();
  input.onAssistantStart(responseId);
  const { content, meta } = await streamAssistantResponse(
    input.tripId,
    [{ role: "user", content: input.content }],
    input.onAssistantDelta,
    input.signal,
    messageIdempotencyKey,
    input.viewContext,
  );
  if (!content.trim() && !meta?.blocks?.length) throw new Error("Assistant returned an empty response");
  if (meta?.proposedCommand) input.onProposal?.(meta.proposedCommand);
  if (meta?.surface) input.onSurfaceSelect?.(meta.surface);
  return { meta, content };
}
