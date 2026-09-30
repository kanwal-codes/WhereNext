/** Tavily's `content` is a raw scraped extract, not a single coherent blurb — the page it pulled
 *  from can splice together a clean description, a "[...]" truncation marker, and then a second
 *  reviewer's byline ("The Happy Traveler ·Jul 2026") and their own blurb, all as one string with
 *  no boundary of its own. Live-caught: a Montmorency Falls result showed exactly that — a
 *  legitimate paragraph followed by an orphaned byline and a typo'd second review — rendered
 *  verbatim as the page's "About" copy. Cut at the first such splice marker and end on a full
 *  sentence, so what's shown reads as one coherent excerpt instead of a raw scrape dump. */
export function cleanExcerpt(content: string): string {
  const spliceMarkers = [
    /\[\s*\.\.\.\s*\]/, // an inline "[...]" truncation marker
    /[A-Z][\w' .-]{1,40}\s*[·•]\s*[A-Z][a-z]{2,8}\.?\s+\d{4}\b/, // an embedded "Name ·Mon YYYY" byline
  ];
  let cut = content.replace(/[\uE000-\uF8FF\uFFFD]/g, "").replace(/\s+/g, " ");
  for (const marker of spliceMarkers) {
    const match = cut.match(marker);
    if (match?.index !== undefined) cut = cut.slice(0, match.index);
  }
  cut = cut.replace(/([.!?])(\s+\.)+/g, "$1").replace(/\s+([.,;:!?])/g, "$1").trim();
  // A scrape often starts mid-sentence (", and solo operations continue…"): begin at the next full sentence.
  cut = cut.replace(/^[^\p{L}\p{N}]+/u, "");
  if (/^\p{Ll}/u.test(cut)) {
    const next = cut.match(/[.!?]\s+(?=\p{Lu})/u);
    if (next?.index !== undefined) cut = cut.slice(next.index + next[0].length);
  }
  const MAX_CHARS = 500;
  if (cut.length > MAX_CHARS) cut = cut.slice(0, MAX_CHARS);
  // A splice-marker cut (or the length cap above) can leave a dangling clause with no terminal
  // punctuation ("...2-3 hours. Visitors commend the") — trim back to the last full sentence,
  // but only when that keeps a meaningful chunk of the text, not for a short excerpt that simply
  // never had terminal punctuation to begin with.
  if (!/[.!?]$/.test(cut)) {
    const lastSentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    if (lastSentenceEnd > cut.length * 0.4) cut = cut.slice(0, lastSentenceEnd + 1);
  }
  return cut.trim();
}


/** A review-site dump, not a description: page chrome ("Translate", "Helpful", "user-icon") and a
 *  star score glued onto a reviewer's text. Showing it as "About" is worse than showing nothing. */
export function isScrapeJunk(content: string): boolean {
  return /^\s*Title:|\b(Translate|Helpful|user-icon|Was this review|Reviewed on [A-Z][a-z]{2})\b|\d(\.\d)?\/5\b|[\uE000-\uF8FF\uFFFD]/.test(content);
}
