// A markdown image/link's target is checked against allowedUrls whether it's absolute (an
// external source/event/place link) or a same-origin relative path — the photo proxy
// (/api/trips/<id>/places/google/photo?...) is exactly this shape, and IS added to allowedUrls
// (assistant-turn.ts). Restricting these to https?:// only would silently skip the check
// entirely for that whole URL class, letting an unvetted relative URL (e.g. a different trip's
// photo endpoint) through with no allow-list enforcement at all.
const LINK_URL = "(https?:\\/\\/[^)\\s]+|\\/[^)\\s]+)";

// The COMPOSE system prompt already tells the model never to restate a price in prose (cards
// carry that) and never to guess one — so any currency-looking amount that DOES show up in the
// reply is either a rule violation echoing a real evidence figure (harmless — it's grounded) or
// a fabricated one (exactly the failure mode link-only sanitizing can't catch). This only
// matches amounts that actually look like money — a bare number ("3 days", "Day 2") never
// matches — so it can't misfire on ordinary counts/dates in the reply.
//
// The optional trailing `(?:\s?[-–—]\s?\d[\d,]*(?:\.\d{1,2})?)?` folds a "$40-60"-style range
// into the SAME match as its leading "$40": a natural range only carries the currency symbol
// once, so without this the replace below only recognizes and swaps out the "$40" half, leaving
// the bare "-60" behind untouched — producing "an amount I can't verify here-60" verbatim in the
// reply. Matching the whole range keeps the fallback phrase clean either way.
//
// The leading `(?:CA|US|AU|NZ|HK|SG|MX)?` folds a country-disambiguated dollar sign ("CA$15",
// "US$20") into the SAME match as the symbol right after it — without this the match starts AT
// the `$`, leaving the letters as untouched literal text before the replacement phrase and
// producing "CAan amount I can't verify here" verbatim in the reply (live-caught on an
// Uber-fare answer, "CA$X to CA$Y" — every dollar amount matched this shape).
const MONEY_PATTERN = /(?:CA|US|AU|NZ|HK|SG|MX)?[$€£¥]\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?[-–—]\s?\d[\d,]*(?:\.\d{1,2})?)?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|CAD|AUD|JPY|INR|CHF|MXN)\b/gi;

const BARE_NUMBER = /\d[\d,]*(?:\.\d{1,2})?/g;

/** Every number embedded in a money-looking match (2 for a "$40-60" range, 1 otherwise). */
function numbersIn(amount: string): number[] {
  return [...amount.matchAll(BARE_NUMBER)].map((m) => Number(m[0].replace(/,/g, "")));
}

/** Every number that appears as part of an actual money figure somewhere in the grounding text —
 *  NOT every bare number in it (dates, ids, ratings). Restricting to money-shaped figures keeps
 *  the approximate check below from accidentally validating a fabricated price just because some
 *  unrelated number in the evidence happens to be close to it. */
function groundedMoneyNumbers(groundingText: string): number[] {
  return [...groundingText.matchAll(MONEY_PATTERN)].flatMap((m) => numbersIn(m[0]));
}

/** Within 25% of some real grounded figure — a model naturally rounds or combines retrieved
 *  numbers ("about $40-60" summarizing two source snippets) rather than quoting one verbatim;
 *  requiring an exact character match treated that normal paraphrasing the same as a fabricated
 *  number, blanking out nearly every price in a free-text answer regardless of how well-founded
 *  it was. 25% keeps a genuinely made-up figure (no real number anywhere near it) from passing. */
const APPROX_TOLERANCE = 0.25;
function isApproximatelyGrounded(value: number, groundedNumbers: number[]): boolean {
  return groundedNumbers.some((g) => Math.abs(value - g) <= Math.max(value, g) * APPROX_TOLERANCE);
}

/**
 * `groundingText` — the turn's full evidence + trip-context JSON (the same string already sent
 * to the model as its `system` prompt) — is optional so existing callers with nothing to check
 * against (compare-chat, tests) keep working unchanged; passing it enables the money check
 * below. An exact substring match is tried first (cheap, and the common case when the model
 * echoes a card's own figure); a number that doesn't match verbatim still passes if it's close
 * to a real money figure found in the evidence, rather than being blanked purely for not being a
 * character-for-character quote. `userText` — what the traveller wrote — counts as grounding too.
 */
export function sanitizeAssistantContent(content: string, allowedUrls: ReadonlySet<string>, groundingText?: string, userText?: string) {
  let out = content
    .replace(/!\[[^\]]*\]\([^)]*$/g, "")
    .replace(new RegExp(`!\\[([^\\]]*)\\]\\(${LINK_URL}\\)`, "gi"), (match, _alt: string, url: string) => allowedUrls.has(url) ? match : "")
    .replace(new RegExp(`\\[([^\\]]+)\\]\\(${LINK_URL}\\)`, "gi"), (match, label: string, url: string) => allowedUrls.has(url) ? match : label)
    .replace(/https?:\/\/[^\s)]+/gi, (url: string) => allowedUrls.has(url) ? url : "");
  if (groundingText) {
    // Figures the traveller typed themselves are grounded, in any shape: "80" in their message
    // makes "CA$80" in the reply theirs to hear back, not an invention.
    const groundedNumbers = [...groundedMoneyNumbers(groundingText), ...(userText ? numbersIn(userText) : [])];
    out = out.replace(MONEY_PATTERN, (amount) => {
      if (groundingText.includes(amount)) return amount;
      const values = numbersIn(amount);
      return values.length > 0 && values.every((v) => isApproximatelyGrounded(v, groundedNumbers))
        ? amount
        : "an amount I can't verify here";
    });
  }
  return out;
}
