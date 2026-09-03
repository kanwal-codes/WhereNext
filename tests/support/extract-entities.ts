/**
 * Pull the proper-noun-ish entities an assistant turn commits to — from the streamed
 * prose and from every card block. The grounding eval asserts this set is a subset of
 * the retrieved evidence's names.
 */

type AnyBlock = { type: string; [k: string]: unknown };

const NAME_KEYS = ["name", "title", "airline", "hotelName"];

function fromBlocks(blocks: AnyBlock[] | undefined): string[] {
  const out: string[] = [];
  for (const b of blocks ?? []) {
    const lists = [b.places, b.items].filter(Array.isArray) as Array<Array<Record<string, unknown>>>;
    for (const list of lists) {
      for (const item of list) {
        for (const key of NAME_KEYS) {
          const v = item[key];
          if (typeof v === "string" && v.trim()) out.push(v.trim());
        }
      }
    }
  }
  return out;
}

/**
 * Capitalised multi-word spans in prose ("Notre-Dame Basilica", "Hotel Bonaventure").
 * Deliberately loose: the eval wants to catch a *fabricated* venue name, so over-capture
 * (then intersect with a stop-list) beats missing one.
 */
function fromProse(text: string): string[] {
  const spans = text.match(/\b([A-Z][\w&'.-]+(?:\s+(?:of|de|la|le|du|des|and|&|the)\s+)?(?:[A-Z][\w&'.-]+|\d+)){1,5}\b/g) ?? [];
  return spans.map((s) => s.trim());
}

const STOP = new Set([
  "I", "You", "Your", "It", "The", "This", "That", "Day", "Days", "Here", "There",
  "Montreal", "Lisbon", "Shanghai", "Toronto", "London", "Google", "Maps",
]);

export function extractEntities(prose: string, blocks?: AnyBlock[]): string[] {
  const raw = [...fromBlocks(blocks), ...fromProse(prose)];
  const seen = new Set<string>();
  return raw
    .map((s) => s.replace(/[.,;:]+$/, "").trim())
    .filter((s) => s.length > 2 && !STOP.has(s) && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

/** Normalised containment: is `needle` mentioned within any `hay` entry (either direction)? */
export function isGrounded(needle: string, hay: string[]): boolean {
  const n = needle.toLowerCase();
  return hay.some((h) => {
    const x = h.toLowerCase();
    return x.includes(n) || n.includes(x);
  });
}
