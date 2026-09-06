import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { resolveProvider, resolveProviderChain } from "./gateway";

/** One entry in the COMPOSE model chain: the model plus any per-provider request options.
 *  `modelId` is the actual resolved model string — the route traces this, not the env var
 *  it started from, so a fallback hop shows up as what really answered the turn. */
export type ComposeModel = { model: LanguageModel; providerOptions?: Record<string, Record<string, string | number | boolean>>; modelId: string };

export function stripUnsupportedReasoningContent(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.messages)) return body;
  return {
    ...body,
    messages: body.messages.map((message) => {
      if (!message || typeof message !== "object") return message;
      const { reasoning_content: _reasoningContent, ...supported } = message as Record<string, unknown>;
      return supported;
    }),
  };
}

function toComposeModel(r: ReturnType<typeof resolveProvider>): ComposeModel {
  const model = createOpenAICompatible({
    name: "compose",
    baseURL: r.baseUrl,
    apiKey: r.apiKey,
    ...(r.supportsReasoningOptions ? { transformRequestBody: stripUnsupportedReasoningContent } : {}),
  }).chatModel(r.model);
  // gpt-oss on Cerebras emits a harmony analysis channel; keep the effort (and the leak) low.
  // Harmless on models that ignore it; the streaming reasoning gate is the real backstop.
  return r.supportsReasoningOptions ? { model, modelId: r.model, providerOptions: { compose: { reasoningEffort: "low" } } } : { model, modelId: r.model };
}

/**
 * The COMPOSE-stage model as an AI SDK `LanguageModel`. Endpoint + key + model id come from
 * the same env resolution as the legacy gateway (`AI_PROVIDER` / `AI_BASE_URL` / `AI_MODEL`).
 */
export function composeModel(model?: string): LanguageModel {
  return toComposeModel(resolveProvider({ model })).model;
}

/** Primary + `AI_FALLBACK_PROVIDERS`, each as a `ComposeModel`. The route tries the next one
 *  when a model's first chunk errors (provider down / rate-limited). */
export function composeModelChain(model?: string): ComposeModel[] {
  return resolveProviderChain({ model }).map(toComposeModel);
}
