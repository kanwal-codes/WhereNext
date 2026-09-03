import type { SupabaseClient } from "@supabase/supabase-js";
import { createConversationRepository } from "../infrastructure/conversationRepository";
import { stripReasoning } from "@/lib/ai/strip-reasoning";

type StreamDelta = { choices?: Array<{ delta?: { content?: string } }> };

function appendDelta(line: string, onContent: (content: string) => void) {
  if (!line.startsWith("data: ") || line.includes("[DONE]")) return;
  try {
    const event = JSON.parse(line.slice(6)) as StreamDelta;
    const content = event.choices?.[0]?.delta?.content;
    if (content) onContent(content);
  } catch {
    // Preserve the provider stream when an individual event is malformed.
  }
}

/**
 * Tees the provider SSE stream to the client while accumulating the assistant text.
 * On completion it persists the (optionally sanitized) text plus `meta` to the
 * conversation row, and emits one final `data: {"meta": ...}` frame so the client
 * gets the structured blocks after the text is done.
 */
export function persistedAssistantStream(
  body: ReadableStream<Uint8Array>,
  supabase: SupabaseClient,
  tripId: string,
  idempotencyKey: string,
  sanitize?: (content: string) => string,
  meta?: Record<string, unknown>,
  onComplete?: (finalText: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let assistant = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        pending += decoder.decode();
        appendDelta(pending, (content) => { assistant += content; });
        const clean = stripReasoning(assistant);
        const finalText = sanitize ? sanitize(clean) : clean;
        if (finalText || meta) {
          await createConversationRepository(supabase).append(tripId, { role: "assistant", content: finalText, idempotencyKey, metadata: meta ?? {} });
        }
        try {
          onComplete?.(finalText);
        } catch {
          /* tracing must never break the response */
        }
        // The final frame carries the sanitized text too, so the client can settle on the persisted
        // content without refetching the conversation.
        if (meta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta, content: finalText })}\n\n`));
        controller.close();
        return;
      }
      pending += decoder.decode(chunk.value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) appendDelta(line, (content) => { assistant += content; });
      controller.enqueue(chunk.value);
    },
    async cancel() { await reader.cancel(); },
  });
}
