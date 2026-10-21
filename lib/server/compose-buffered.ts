import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { logger } from "@/lib/server/logger";
import type { composeModelChain } from "@/packages/ai/compose-model";
import { AI_DEADLINE_MS, COMPOSE_MAX_STEPS, withDeadline } from "@/packages/ai/model-policy";

export type BufferedCompose = { text: string; modelId: string; usage: { inputTokens?: number; outputTokens?: number } | undefined };

/** The caller hanging up (Next aborts with a plain Error named "ResponseAborted") is not a model failing. */
const isHangup = (error: unknown, signal: AbortSignal) =>
  signal.aborted || (error instanceof Error && (error.name === "AbortError" || error.name === "ResponseAborted"));

/**
 * COMPOSE as one buffered call (the group chat's @Roam reply): tries the primary model, then each fallback, until one answers.
 * Buffered rather than streamed because there is no clean way to fail over to another provider once partial text has reached
 * the client, and `generateText` takes the identical tools / step limit / provider options.
 *
 * Throws the last model's error when all fail, and straight away on a hang-up (no point trying the next model for nobody).
 */
export async function composeBuffered(args: {
  chain: ReturnType<typeof composeModelChain>;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  signal: AbortSignal;
}): Promise<BufferedCompose> {
  const { chain, system, messages, tools, signal } = args;
  let lastError: unknown;
  for (let i = 0; i < chain.length; i += 1) {
    const entry = chain[i];
    try {
      const generated = await generateText({
        model: entry.model,
        system,
        messages,
        tools,
        stopWhen: stepCountIs(COMPOSE_MAX_STEPS),
        // Only the LAST provider in the chain (nowhere left to fail over to) gets the full
        // buffered budget — an earlier attempt that's merely stalled (not actually down)
        // used to cost the user the entire 60s before this route would even try the next
        // model, worse than the streaming path's tiered time-to-first-token fallback.
        abortSignal: withDeadline(signal, i < chain.length - 1 ? AI_DEADLINE_MS.composeBufferedFallback : AI_DEADLINE_MS.composeBuffered),
        ...(entry.providerOptions ? { providerOptions: entry.providerOptions } : {}),
      });
      return { text: generated.text, modelId: entry.modelId, usage: generated.usage };
    } catch (error) {
      if (isHangup(error, signal)) throw error;
      lastError = error;
      logger.warn({ err: error, attempt: i }, "group-chat compose model failed, trying next in chain");
    }
  }
  throw lastError ?? new Error("compose produced no model");
}
