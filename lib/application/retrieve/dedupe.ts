/**
 * Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — the canonical-model doc's
 * dedup upgrade (docs/overhaul/chatbot-overhaul/data-normalization-model.md), applied to the one
 * place this app actually has cross-provider duplicate entities today: `handleEvents` merged
 * Ticketmaster and Eventbrite results with no dedup at all (a plain concatenation), so the same
 * real-world event listed on both providers showed up twice.
 *
 * Foursquare's own published approach is geo-block first (cheap, so an expensive similarity pass
 * only runs on nearby candidates), then fuzzy-match. Skipped the geo-block step here specifically:
 * Eventbrite's venue-search endpoint (an undocumented, reverse-engineered one — see
 * packages/providers/eventbrite/client.ts) doesn't reliably expose venue coordinates, and at this
 * app's actual scale (a handful of merged events per turn, not Foursquare's millions of POIs) an
 * O(n²) pairwise fuzzy pass is trivially cheap — blocking exists purely to make comparison
 * affordable at scale, which doesn't apply here.
 */

/**
 * Jaro-Winkler similarity, 0 (nothing alike) to 1 (identical) — the record-linkage-literature
 * standard for short strings (names, titles), weighting a shared prefix more than plain
 * Levenshtein distance would. That fits this app's actual duplicates well: two providers listing
 * the same event tend to share an exact opening ("Katseye" vs "Katseye - World Tour 2026") more
 * than they share a random substring in the middle.
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i += 1) {
    if (a[i] !== b[i]) break;
    prefix += 1;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

const normalizeText = (s: string) =>
  s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

/** Above this, two titles are "the same event" rather than two similarly-named ones. Tuned
 *  loosely high (record-linkage practice: prefer a missed duplicate over a wrongly-merged
 *  distinct event) — verified against real near-miss pairs in dedupe.test.ts. */
const TITLE_MATCH_THRESHOLD = 0.9;
const VENUE_MATCH_THRESHOLD = 0.85;

/**
 * Drops a later duplicate of an earlier item — same calendar day (or both undated) and a
 * fuzzy-matching title, corroborated by a fuzzy-matching venue name when both sides have one
 * (skipped, not required, when either is missing — a generic title like "Open Mic Night" at two
 * DIFFERENT venues on the same day must not collapse into one event just because neither
 * provider gave a venue to disprove it against; venue corroboration only ever narrows a match,
 * never widens it). First-listed wins and is kept — callers order their input provider-priority
 * first, so this doubles as "prefer provider A's copy over provider B's."
 */
export function dedupeByFuzzyMatch<T extends { title: string; venue?: string; startDate?: string }>(items: T[]): T[] {
  const kept: Array<{ item: T; title: string; venue: string | null }> = [];
  const out: T[] = [];
  for (const item of items) {
    const title = normalizeText(item.title);
    const venue = item.venue ? normalizeText(item.venue) : null;
    const isDuplicate = kept.some((k) => {
      if ((k.item.startDate ?? null) !== (item.startDate ?? null)) return false;
      // One provider often tacks a tour/year suffix onto the other's cleaner title ("Katseye" vs
      // "Katseye - World Tour 2026") — plain Jaro-Winkler under-scores that on length alone
      // despite the full-prefix overlap, so a genuine containment match (either direction, and
      // long enough not to be a coincidental short prefix) short-circuits straight to a match.
      const contains = title.length >= 4 && k.title.length >= 4 && (title.includes(k.title) || k.title.includes(title));
      if (!contains && jaroWinkler(title, k.title) < TITLE_MATCH_THRESHOLD) return false;
      if (venue && k.venue) return jaroWinkler(venue, k.venue) >= VENUE_MATCH_THRESHOLD;
      return true; // no venue on one or both sides — title + date match alone stands
    });
    if (isDuplicate) continue;
    kept.push({ item, title, venue });
    out.push(item);
  }
  return out;
}
