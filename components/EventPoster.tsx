import { CalendarClock, Drama, Mic2, Music, Palette, PartyPopper, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stand-in artwork for an event with no provider image. Deterministic from the title so the
 * same event always looks the same — a soft coral-family duotone with the genre's own glyph.
 * Reads as designed, not as a missing image.
 *
 * ponytail: no image search here. If a real poster matters, wire an image API + proxy route
 * and pass its result as `imageUrl`; this is the fallback when that comes back empty.
 */
const DUOTONES = [
  "from-coral-soft via-card to-card",
  "from-card via-coral-soft/60 to-coral-soft",
  "from-coral-soft/70 to-[color-mix(in_oklab,var(--color-coral)_12%,var(--color-card))]",
  "from-[color-mix(in_oklab,var(--color-coral)_10%,var(--color-card))] to-card",
];

const GENRE_ICON: Array<[RegExp, LucideIcon]> = [
  [/concert|music|tour|live|dj|band|festival|gig|symphon|orchestr/i, Music],
  [/comedy|stand.?up|humou?r|improv/i, Mic2],
  [/theat|play|opera|ballet|dance|musical|cabaret/i, Drama],
  [/match|game|cup|league|hockey|soccer|football|basketball|nba|nhl|mlb|race|tournament/i, Trophy],
  [/art|expo|exhibit|gallery|museum|design|paint/i, Palette],
  [/party|club|night|rave|social|mixer/i, PartyPopper],
];

function iconFor(title: string): LucideIcon {
  for (const [re, icon] of GENRE_ICON) if (re.test(title)) return icon;
  return CalendarClock;
}

/** djb2 → non-negative int. */
function hash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function EventPoster({ title, className }: { title: string; className?: string }) {
  const Icon = iconFor(title);
  const tone = DUOTONES[hash(title) % DUOTONES.length];
  return (
    <div className={cn("relative isolate grid place-items-center overflow-hidden bg-gradient-to-br", tone, className)}>
      <Icon className="size-14 text-coral-ink/60" strokeWidth={1.25} aria-hidden />
    </div>
  );
}
