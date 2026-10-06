/** Strip inline HTML tags from a short provider string (descriptions, reviews). */
export const stripTags = (value: string): string => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

const SKIP_BLOCKS = new Set(["script", "style", "noscript", "template", "svg"]);
const NEWLINE_TAGS = new Set(["p", "div", "section", "article", "li", "tr", "br", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6"]);
/** Hard cap on how much of a page is looked at. The body comes from an attacker-chosen URL. */
const MAX_INPUT_CHARS = 1_000_000;

/**
 * Remove markup in ONE linear pass. This replaced a chain of unanchored regexes
 * (`<[^>]+>`, `<(script|…)[\s\S]*?<\/\1>`, `<!--[\s\S]*?-->`) that are quadratic on a page made of
 * unclosed `<` / `<svg` / `<!--` openers: each opener rescanned to the end of the input, and the
 * work is synchronous, so one 2 MB page could pin the event loop. Here every character is visited
 * a bounded number of times: `indexOf` only ever moves forward, and "no closer exists" is
 * remembered per tag name instead of being rediscovered at every opener.
 */
function stripMarkup(html: string, outputLimit: number): string {
  const lower = html.toLowerCase();
  const noCloser = new Set<string>();
  const out: string[] = [];
  let outLen = 0;
  const push = (text: string) => {
    if (!text) return;
    out.push(text);
    outLen += text.length;
  };
  let i = 0;
  while (i < html.length && outLen < outputLimit) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      push(html.slice(i));
      break;
    }
    push(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end !== -1) {
        push(" ");
        i = end + 3;
        continue;
      }
    }
    const match = /^<(\/?)([a-z][a-z0-9]*)/.exec(lower.slice(lt, lt + 24));
    const closing = match?.[1] === "/";
    const name = match?.[2] ?? "";
    if (match && !closing && SKIP_BLOCKS.has(name) && !noCloser.has(name)) {
      const close = lower.indexOf(`</${name}`, lt);
      if (close === -1) {
        noCloser.add(name);
      } else {
        const gt = html.indexOf(">", close);
        push(" ");
        i = gt === -1 ? html.length : gt + 1;
        continue;
      }
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) {
      push(html.slice(lt)); // no '>' left anywhere, so no further tag can exist: the rest is text
      break;
    }
    push(match && NEWLINE_TAGS.has(name) && (closing || name === "br") ? "\n" : " ");
    i = gt + 1;
  }
  return out.join("");
}

/**
 * Reduce a full HTML document to readable plain text: drop script/style/head
 * noise, turn block tags into newlines, strip the rest, decode the handful of
 * entities that matter, and cap the length. Good enough to feed an extractor —
 * not a DOM.
 */
export function htmlToText(html: string, maxChars = 12_000): string {
  const text = stripMarkup(html.length > MAX_INPUT_CHARS ? html.slice(0, MAX_INPUT_CHARS) : html, maxChars * 4)
    .replace(/&(#?\w+);/g, (m, code: string) => {
      if (ENTITIES[code]) return ENTITIES[code];
      if (/^#\d+$/.test(code)) {
        const point = Number(code.slice(1));
        return point <= 0x10ffff ? String.fromCodePoint(point) : m;
      }
      return m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
