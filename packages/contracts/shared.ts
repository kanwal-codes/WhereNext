import { z } from "zod";

/**
 * A JSON object with no fixed shape (a decision's value, a share card's metadata) but bounded —
 * unlike every other schema in the app, a bare `z.record()` here would let any editor (or the
 * AI's own proposal path) push an arbitrarily large, deeply nested blob straight into the
 * database. `maxChars` caps the serialized size, not a specific structure.
 */
export function boundedRecord(maxChars = 20_000) {
  return z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= maxChars, {
    message: `Too large — must serialize to ${maxChars} characters or fewer`,
  });
}
