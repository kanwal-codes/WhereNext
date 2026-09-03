/** Rough $ / 1M tokens for the models this app actually calls. Update when prices move. */
const PRICE: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-oss-120b": { in: 0.15, out: 0.6 }, // Cerebras — approximate
  default: { in: 0.5, out: 1.5 },
};

export function costUsd(model: string | undefined, promptTokens: number, completionTokens: number): number {
  const p = (model && PRICE[model]) || PRICE.default;
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

/** Char/4 fallback when a provider (or a local fake) doesn't return a usage block. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
