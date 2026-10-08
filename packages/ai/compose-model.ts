import type { LanguageModel } from "ai";
import { composeModelChain as resolveComposeChain } from "./model-policy";
import type { ProviderOptions } from "./llm";

/** One entry in the COMPOSE model chain: the model plus the id the route traces (this, not the
 *  env var it started from, so a fallback hop shows up as what really answered the turn).
 *  `providerOptions` is forwarded to `streamText`/`generateText` when an entry carries any. */
export type ComposeModel = { model: LanguageModel; modelId: string; providerOptions?: ProviderOptions };

/**
 * Primary + fallback COMPOSE models, called directly on Anthropic (see
 * `packages/ai/model-policy.ts` / `llm.ts`). The route tries the next one when a model's
 * first chunk errors (provider down / rate-limited) or, for the buffered group-chat caller,
 * when the whole call fails.
 */
export function composeModelChain(): ComposeModel[] {
  return resolveComposeChain();
}
