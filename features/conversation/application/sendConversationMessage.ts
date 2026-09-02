import type { AssistantTurnMeta, ProposedCommand } from "@/packages/contracts/assistant";
import { persistUserMessage } from "./conversationActions";
import { streamAssistantResponse } from "./streamAssistantResponse";

export async function sendConversationMessage(input: {
  tripId: string;
  content: string;
  onSurfaceSelect?: (surface: string) => void;
  onProposal?: (proposal: ProposedCommand) => void;
  onUserSaved: () => void;
  onAssistantStart: (responseId: string) => void;
  onAssistantDelta: (content: string) => void;
  signal?: AbortSignal;
}): Promise<AssistantTurnMeta | undefined> {
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
  );
  if (!content.trim() && !meta?.blocks?.length) throw new Error("Assistant returned an empty response");
  if (meta?.proposedCommand) input.onProposal?.(meta.proposedCommand);
  if (meta?.surface) input.onSurfaceSelect?.(meta.surface);
  return meta;
}
