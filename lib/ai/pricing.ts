/** Rough $ / 1M tokens for the models this app actually calls. Update when prices move. */
const PRICE: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-oss-120b": { in: 0.15, out: 0.6 }, // Cerebras — approximate
  "qwen-3.8-27b": { in: 0.1, out: 0.1 }, // Cerebras fast model — approximate
  "gemini-flash-latest": { in: 0.075, out: 0.3 }, // Gemini Flash tier
  "anthropic/claude-sonnet-4.5": { in: 3, out: 15 }, // OpenRouter
  default: { in: 0.5, out: 1.5 },
};

/** Substring fallbacks for a model id not pinned exactly above (a new OpenRouter/Gemini
 *  variant, a re-pinned Gemini alias) — closer than the flat default, still approximate. */
const PRICE_PATTERNS: Array<[RegExp, { in: number; out: number }]> = [
  [/claude.*opus/i, { in: 15, out: 75 }],
  [/claude/i, { in: 3, out: 15 }],
  [/gemini.*pro/i, { in: 1.25, out: 5 }],
  [/gemini/i, { in: 0.075, out: 0.3 }],
  [/gpt-4o-mini/i, { in: 0.15, out: 0.6 }],
  [/gpt-4o/i, { in: 2.5, out: 10 }],
];

function priceFor(model: string | undefined) {
  if (!model) return PRICE.default;
  if (PRICE[model]) return PRICE[model];
  for (const [pattern, price] of PRICE_PATTERNS) if (pattern.test(model)) return price;
  return PRICE.default;
}

export function costUsd(model: string | undefined, promptTokens: number, completionTokens: number): number {
  const p = priceFor(model);
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

/** Char/4 fallback when a provider (or a local fake) doesn't return a usage block. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** One model call's token usage, tagged with the model that actually answered it — a turn can
 *  fan out across several different models (RESOLVE, each bulk block-builder, COMPOSE), so a
 *  single blended model string can't price it correctly. */
export type UsageEntry = { model: string | undefined; promptTokens: number; completionTokens: number };

/** Sum cost across every model call in a turn, each priced by its own model. */
export function sumCostUsd(entries: UsageEntry[]): number {
  return entries.reduce((total, entry) => total + costUsd(entry.model, entry.promptTokens, entry.completionTokens), 0);
}
