import type { AssistantTurnMeta } from "@/packages/contracts/assistant";

type AssistantDelta = { choices?: Array<{ delta?: { content?: string } }>; meta?: AssistantTurnMeta };

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
): Promise<{ content: string; meta?: AssistantTurnMeta }> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId, messages, messageIdempotencyKey }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new AssistantRequestError(response.status, body?.error ?? "Assistant unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let meta: AssistantTurnMeta | undefined;

  const handle = (line: string) => {
    if (!line.startsWith("data: ") || line.includes("[DONE]")) return;
    try {
      const event = JSON.parse(line.slice(6)) as AssistantDelta;
      if (event.meta) { meta = event.meta; return; }
      const delta = event.choices?.[0]?.delta?.content ?? "";
      content += delta;
      if (delta) onDelta(content);
    } catch {
      // Ignore malformed provider events; the server persists valid content.
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    pending += decoder.decode(chunk.value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) handle(line);
  }
  pending += decoder.decode();
  if (pending) handle(pending.startsWith("data: ") ? pending : `data: ${pending}`);
  return { content, meta };
}
