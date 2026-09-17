import type { LanguageModel } from "ai";
import { composeModelChain as resolveComposeChain } from "./model-policy";
import type { GatewayProviderOptions } from "./gateway";

/** One entry in the COMPOSE model chain: the model plus the id the route traces (this, not the
 *  env var it started from, so a fallback hop shows up as what really answered the turn).
 *  `providerOptions` pins the Gateway to one inference provider (Phase 2.1) and/or requests
 *  prompt caching (Phase 2.4) — `undefined` for every entry in COMPOSE's chain today, but
 *  callers must still forward it to `streamText`/`generateText` so a future pinned/cached
 *  COMPOSE entry isn't silently dropped. */
export type ComposeModel = { model: LanguageModel; modelId: string; providerOptions?: GatewayProviderOptions };

/**
 * Primary + fallback COMPOSE models, resolved through Vercel AI Gateway (see
 * `packages/ai/model-policy.ts` / `gateway.ts`). The route tries the next one when a model's
 * first chunk errors (provider down / rate-limited) or, for the buffered group-chat caller,
 * when the whole call fails.
 */
export function composeModelChain(): ComposeModel[] {
  return resolveComposeChain();
}
