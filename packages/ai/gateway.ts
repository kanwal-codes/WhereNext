export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
import { OpenAiCompatibleProvider } from "./providers/openai-compatible";

export type AiProviderName = "openai" | "openai-compatible" | "cerebras" | "gemini";

// `||` not `??` everywhere below: the env template ships these keys blank, and an
// empty string must fall through to the default, not count as a real value.
const OPENAI = {
  baseUrl: "https://api.openai.com/v1",
  key: () => process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
  defaultModel: "gpt-4o",
  reasoning: false,
  envHint: "AI_API_KEY or OPENAI_API_KEY",
} as const;

const PROVIDERS: Record<AiProviderName, { baseUrl: string; key: () => string | undefined; defaultModel: string; reasoning: boolean; envHint: string }> = {
  openai: OPENAI,
  "openai-compatible": OPENAI,
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    key: () => process.env.CEREBRAS_API_KEY,
    defaultModel: "gpt-oss-120b",
    reasoning: true,
    envHint: "CEREBRAS_API_KEY",
  },
  gemini: {
    // Gemini speaks OpenAI's protocol at this path, so the existing provider works unchanged.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: () => process.env.GEMINI_API_KEY,
    defaultModel: "gemini-2.5-flash",
    reasoning: false,
    envHint: "GEMINI_API_KEY",
  },
};

/**
 * The chat/reasoning gateway. `AI_PROVIDER` (+ `AI_BASE_URL` / `AI_MODEL`) picks
 * the primary provider; pass `{ provider }` to pin one regardless of env — a
 * pinned provider ignores `AI_BASE_URL` / `AI_MODEL` and uses its own defaults.
 */
export function createAiGateway(overrides: { model?: string; provider?: AiProviderName } = {}) {
  const pinned = overrides.provider != null;
  const name: AiProviderName = overrides.provider ?? (process.env.AI_PROVIDER as AiProviderName) ?? "openai-compatible";
  const p = PROVIDERS[name] ?? PROVIDERS["openai-compatible"];
  const key = p.key();
  if (!key) throw new Error(`${p.envHint} is not configured`);
  return new OpenAiCompatibleProvider({
    apiKey: key,
    model: overrides.model || (pinned ? p.defaultModel : process.env.AI_MODEL || p.defaultModel),
    baseUrl: pinned ? p.baseUrl : process.env.AI_BASE_URL || p.baseUrl,
    supportsReasoningOptions: p.reasoning,
  });
}

/**
 * Cheap, huge-context model for bulk extraction / summarisation of long or
 * low-stakes text — web-page import, event blurbs, hotel descriptions, thread
 * summaries. Routes to Gemini Flash when `GEMINI_API_KEY` is set; otherwise it
 * transparently falls back to the primary gateway, so nothing breaks without a key.
 */
export function createBulkGateway(overrides: { model?: string } = {}) {
  if (!process.env.GEMINI_API_KEY) return createAiGateway(overrides);
  return createAiGateway({ provider: "gemini", model: overrides.model || process.env.GEMINI_BULK_MODEL || undefined });
}
