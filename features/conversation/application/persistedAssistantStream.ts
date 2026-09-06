import type { SupabaseClient } from "@supabase/supabase-js";
import { createConversationRepository } from "../infrastructure/conversationRepository";
import { stripReasoning } from "@/lib/ai/strip-reasoning";
import { createSseParser, parseSseJson } from "@/packages/ai/sse";
import { logger } from "@/lib/server/logger";

type StreamDelta = { choices?: Array<{ delta?: { content?: string } }> };

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
  onComplete?: (finalText: string) => void | Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const parser = createSseParser();
  let assistant = "";
  // A malformed provider event is dropped by parseSseJson; the raw stream still passes through.
  const absorb = (payloads: string[]) => {
    for (const payload of payloads) {
      const content = parseSseJson<StreamDelta>(payload)?.choices?.[0]?.delta?.content;
      if (content) assistant += content;
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        absorb(parser.push(decoder.decode()));
        absorb(parser.flush());
        const clean = stripReasoning(assistant);
        const finalText = sanitize ? sanitize(clean) : clean;
        let persistFailed = false;
        if (finalText || meta) {
          try {
            await createConversationRepository(supabase).append(tripId, { role: "assistant", content: finalText, idempotencyKey, metadata: meta ?? {} });
          } catch (error) {
            // Persistence failed (DB error, or a revalidate call landing outside a request
            // context). The client still gets its answer + blocks from the meta frame below —
            // but flagged, so it renders as "not saved" rather than a good answer gone quiet.
            persistFailed = true;
            logger.error({ err: error, tripId }, "assistant turn persist failed");
          }
        }
        try {
          await onComplete?.(finalText);
        } catch {
          /* tracing must never break the response */
        }
        // The final frame carries the sanitized text too, so the client can settle on the persisted
        // content without refetching the conversation.
        if (meta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: persistFailed ? { ...meta, persistFailed } : meta, content: finalText })}\n\n`));
        controller.close();
        return;
      }
      absorb(parser.push(decoder.decode(chunk.value, { stream: true })));
      controller.enqueue(chunk.value);
    },
    async cancel() { await reader.cancel(); },
  });
}
