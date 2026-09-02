export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
import { OpenAiCompatibleProvider } from "./providers/openai-compatible";

export function createAiGateway(overrides: { model?: string } = {}) {
  // `||` (not `??`): the env template ships these keys blank, and an empty string
  // must fall through to the default / fallback, not be treated as a real value.
  const provider = process.env.AI_PROVIDER || "openai-compatible";
  const cerebras = provider === "cerebras";
  const key = cerebras ? process.env.CEREBRAS_API_KEY : (process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  if (!key) throw new Error(`${cerebras ? "CEREBRAS_API_KEY" : "AI_API_KEY or OPENAI_API_KEY"} is not configured`);
  return new OpenAiCompatibleProvider({
    apiKey: key,
    model: overrides.model || process.env.AI_MODEL || (cerebras ? "gpt-oss-120b" : "gpt-4o-mini"),
    baseUrl: process.env.AI_BASE_URL || (cerebras ? "https://api.cerebras.ai/v1" : "https://api.openai.com/v1"),
    supportsReasoningOptions: cerebras,
  });
}
