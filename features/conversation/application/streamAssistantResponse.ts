import type { AssistantTurnMeta } from "@/packages/contracts/assistant";
import { sseJson } from "@/packages/ai/sse";

type AssistantDelta = {
  choices?: Array<{ delta?: { content?: string } }>;
  meta?: AssistantTurnMeta;
  /** Final sanitized text, sent with the meta frame. Replaces the accumulated stream. */
  content?: string;
  /** Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): a real, backend-driven milestone
   *  ("thinking about your trip…" -> "checking live sources…" -> "pulling it together…"),
   *  replacing the fixed-timer guess the UI used before this. */
  progress?: "resolve" | "retrieve" | "compose";
  /** Set on a "retrieve" progress frame when RESOLVE planned at least one recognized tool —
   *  what's actually being looked up ("checking places", "getting directions"), for a caller
   *  to show in place of a generic "checking live sources…". */
  label?: string;
};

export class AssistantRequestError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
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
  viewContext: string | undefined,
  /** /api/ai persists the user's message itself, as its very first action — this fires once
   *  that's confirmed, whether the rest of the turn goes on to succeed or fail. */
  onUserSaved: () => void,
  /** Phase 2.6.2: fires for each real backend milestone the server streams before any reply
   *  text — optional, so every other caller of this function is unaffected. */
  onProgress?: (stage: "resolve" | "retrieve" | "compose", label?: string) => void,
): Promise<{ content: string; meta?: AssistantTurnMeta }> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId, messages, messageIdempotencyKey, ...(viewContext ? { viewContext } : {}) }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: string; userSaved?: boolean; code?: string } | null;
    if (body?.userSaved) onUserSaved();
    throw new AssistantRequestError(response.status, body?.error ?? "Assistant unavailable", body?.code);
  }
  // A 2xx response is only possible after the route's own persist step succeeded.
  onUserSaved();

  let content = "";
  let meta: AssistantTurnMeta | undefined;

  // A malformed provider event is skipped inside sseJson; the server persists the valid content.
  for await (const event of sseJson<AssistantDelta>(response.body)) {
    if (event.progress) {
      onProgress?.(event.progress, event.label);
      continue;
    }
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
