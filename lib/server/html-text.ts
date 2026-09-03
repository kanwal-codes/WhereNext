/** Strip inline HTML tags from a short provider string (descriptions, reviews). */
export const stripTags = (value: string): string => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/**
 * Reduce a full HTML document to readable plain text: drop script/style/head
 * noise, turn block tags into newlines, strip the rest, decode the handful of
 * entities that matter, and cap the length. Good enough to feed an extractor —
 * not a DOM.
 */
export function htmlToText(html: string, maxChars = 12_000): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, code: string) => ENTITIES[code] ?? (/^#\d+$/.test(code) ? String.fromCodePoint(Number(code.slice(1))) : m))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
