import type { AssistantTurnMeta } from "@/packages/contracts/assistant";
import { sseJson } from "@/packages/ai/sse";

type AssistantDelta = {
  choices?: Array<{ delta?: { content?: string } }>;
  meta?: AssistantTurnMeta;
  /** Final sanitized text, sent with the meta frame. Replaces the accumulated stream. */
  content?: string;
};

export class AssistantRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function streamAssistantResponse(
  tripId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onDelta: (content: string) => void,
  signal: AbortSignal | undefined,
  messageIdempotencyKey: string,
  /** What the user is currently looking at (an open place/stay panel), for deictic references. */
  viewContext?: string,
): Promise<{ content: string; meta?: AssistantTurnMeta }> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId, messages, messageIdempotencyKey, ...(viewContext ? { viewContext } : {}) }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new AssistantRequestError(response.status, body?.error ?? "Assistant unavailable");
  }

  let content = "";
  let meta: AssistantTurnMeta | undefined;

  // A malformed provider event is skipped inside sseJson; the server persists the valid content.
  for await (const event of sseJson<AssistantDelta>(response.body)) {
    if (event.meta) {
      meta = event.meta;
      // The meta frame carries the final sanitized text — it replaces the accumulated stream.
      if (typeof event.content === "string") content = event.content;
      continue;
    }
    const delta = event.choices?.[0]?.delta?.content ?? "";
    content += delta;
    if (delta) onDelta(content);
  }
  return { content, meta };
}
