import { formatMoney, roundMoney } from "@/lib/currency";

/**
 * "Convert 1,184 EUR and 2,200 GBP to CAD": a plain money question answered from the day's reference rates, not by the
 * model. Only fires on an explicit conversion ask with at least one amount in a currency written out, so it never
 * swallows a budget or price question.
 */
export type ConversionAsk = { items: Array<{ amount: number; from: string }>; to: string };

const CODES = new Set(["AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR"]);
const WORDS: Array<[RegExp, string]> = [
  [/^euros?$/i, "EUR"], [/^(?:british )?pounds?(?: sterling)?$/i, "GBP"], [/^(?:us|u\.s\.|american) ?dollars?$/i, "USD"], [/^(?:canadian|cad) ?dollars?$/i, "CAD"],
  [/^yen$/i, "JPY"], [/^francs?$/i, "CHF"], [/^(?:australian) ?dollars?$/i, "AUD"],
];
const SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR" };

const toCode = (token: string): string | null => {
  const upper = token.toUpperCase();
  if (CODES.has(upper)) return upper;
  return WORDS.find(([re]) => re.test(token))?.[1] ?? null;
};

const num = (raw: string): number => Number(raw.replace(/[,\s]/g, ""));

export function parseConversionAsk(prompt: string, homeCurrency: string): ConversionAsk | null {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (!/\b(convert|conversion|exchange rate|exchange|how much is|what(?:'s| is) .* in|in (?:cad|usd|eur|gbp)\b|to (?:cad|usd|eur|gbp)\b)/i.test(text) || !/\d/.test(text)) return null;

  const items: ConversionAsk["items"] = [];
  const seen = new Set<string>();
  const add = (amount: number, from: string | null, index: number) => {
    if (!from || !Number.isFinite(amount) || amount <= 0 || seen.has(`${index}`)) return;
    seen.add(`${index}`);
    items.push({ amount, from });
  };
  // 1,184 EUR / 2200 gbp / 50 euros / 20 us dollars
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(eur|usd|gbp|cad|[a-z]{3}\b|(?:us|u\.s\.|american|canadian|australian|british)? ?(?:euros?|pounds?(?: sterling)?|dollars?|yen|francs?))/gi)) add(num(m[1]!), toCode(m[2]!.trim()), m.index ?? 0);
  // €1,184 / £2,200 / $1,860
  for (const m of text.matchAll(/([€£¥₹$])\s?(\d[\d,]*(?:\.\d+)?)/g)) add(num(m[2]!), m[1] === "$" ? (/\bcad\b|canadian/i.test(text) && !/\busd\b|us dollars?/i.test(text) ? "CAD" : "USD") : SYMBOLS[m[1]!]!, (m.index ?? 0) + 10_000);

  if (items.length === 0) return null;
  // The target: "to CAD", "into euros", "in CAD" (the last such mention), else the trip's own currency.
  let to: string | null = null;
  for (const m of text.matchAll(/\b(?:to|into|in)\s+(?:my\s+|our\s+)?([a-z]{3}\b|(?:us |u\.s\. |american |canadian |australian |british )?(?:euros?|pounds?(?: sterling)?|dollars?|yen|francs?))/gi)) to = toCode(m[1]!.trim()) ?? to;
  to ??= homeCurrency;
  const useful = items.filter((i) => i.from !== to);
  return useful.length ? { items: useful, to } : null;
}

/** The reply: one line per amount and, with several, their total. `rates` maps a currency to how many `to` one unit buys (null: unknown). */
export function formatConversion(ask: ConversionAsk, rates: Map<string, number | null>): string {
  const lines: string[] = [];
  let total = 0;
  let allKnown = true;
  for (const item of ask.items) {
    const rate = rates.get(item.from) ?? null;
    if (!rate) {
      allKnown = false;
      lines.push(`${formatMoney(item.amount, item.from)}: I couldn’t get a rate for ${item.from} right now.`);
      continue;
    }
    const converted = roundMoney(item.amount * rate);
    total += converted;
    lines.push(`${formatMoney(item.amount, item.from)} ≈ ${formatMoney(converted, ask.to)}  (1 ${item.from} = ${rate.toFixed(4)} ${ask.to})`);
  }
  if (ask.items.length > 1 && allKnown) lines.push(`Together ≈ ${formatMoney(roundMoney(total), ask.to)}`);
  lines.push("Rates are the European Central Bank's reference rates for today. A card or exchange desk will charge a little more.");
  return lines.join("\n\n");
}
