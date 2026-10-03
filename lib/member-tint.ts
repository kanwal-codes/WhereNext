/**
 * A stable colour per person for avatars and names in the group chat. Picks from the place-category
 * palette (one lightness/chroma family, so no friend looks louder than another); Roam is always coral.
 * Mixed against `card` and `foreground` so it holds in both themes: a pale tint behind the initials,
 * and a text colour that is the same hue pushed toward the ink (>= 4.5:1 on the tint in light mode).
 */
const HUES = ["see", "do", "event", "eat", "stay"] as const;

function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function memberTint(name: string): { background: string; color: string } {
  const key = name.trim().toLowerCase() === "roam" ? "stay" : HUES[hash(name.trim().toLowerCase()) % HUES.length]!;
  const hue = `var(--cat-${key})`;
  return {
    background: `color-mix(in oklab, ${hue} 17%, var(--color-card))`,
    color: `color-mix(in oklab, ${hue} 52%, var(--color-foreground))`,
  };
}
