/** Shared UI vocabulary for the ported Lovable design surfaces. */

export type Certainty = "confirmed" | "suggested" | "undecided";

/**
 * Nature-drawn accents, each associated with one part of a trip. The crisp theme
 * collapses them all to coral in CSS; the names are kept so semantics stay legible.
 */
export type AccentKey = "water" | "leaf" | "coral" | "amber" | "violet";

/**
 * Rough planning-completeness signal for the progress ring — derived from which
 * parts of the trip actually have content. Not a stored metric, not mock data.
 */
export function tripCompleteness(parts: {
  preferences?: Record<string, unknown> | null;
  savedPlaces?: unknown[];
  itinerary?: unknown[];
  decisions?: unknown[];
  conversation?: unknown[];
  essentials?: unknown[];
}): number {
  const signals = [
    parts.preferences ? Object.keys(parts.preferences).length > 0 : false,
    (parts.savedPlaces?.length ?? 0) > 0,
    (parts.itinerary?.length ?? 0) > 0,
    (parts.decisions?.length ?? 0) > 0,
    (parts.conversation?.length ?? 0) > 2,
    (parts.essentials?.length ?? 0) > 0,
  ];
  return Math.round((signals.filter(Boolean).length / signals.length) * 100);
}

export const accent: Record<AccentKey, { text: string; soft: string; border: string; dot: string; rule: string }> = {
  water: { text: "text-water", soft: "bg-water-soft", border: "border-water/30", dot: "bg-water", rule: "bg-water" },
  leaf: { text: "text-leaf", soft: "bg-leaf-soft", border: "border-leaf/30", dot: "bg-leaf", rule: "bg-leaf" },
  coral: { text: "text-coral", soft: "bg-coral-soft", border: "border-coral/30", dot: "bg-coral", rule: "bg-coral" },
  amber: { text: "text-amber", soft: "bg-amber-soft", border: "border-amber/30", dot: "bg-amber", rule: "bg-amber" },
  violet: { text: "text-violet", soft: "bg-violet-soft", border: "border-violet/30", dot: "bg-violet", rule: "bg-violet" },
};
