/**
 * The small pure pieces behind the trip Overview page: turning the raw trip record, preferences and
 * itinerary rows into what the page shows. No React, so each one is tested on its own.
 */

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** "$180/day", or the free text the traveller gave, or null when no budget is set. */
export function budgetLabel(preferences: Record<string, unknown>): string | null {
  const budget = preferences.budget;
  if (typeof budget === "number" && budget > 0) return `$${budget}/day`;
  if (typeof budget === "string" && budget.trim()) return budget.trim();
  return null;
}

export type TastePicture = {
  likes: string[];
  avoids: string[];
  dietary: string[];
  /** Single-value facts: pace, group, vibe. */
  facets: Array<{ label: string; value: string }>;
};

/** What the trip knows about the group's taste, grouped so it can be shown as chips instead of a list of sentences. */
export function tastePicture(preferences: Record<string, unknown>): TastePicture {
  const facets = [
    { label: "Pace", value: asText(preferences.pace) },
    { label: "Group", value: asText(preferences.groupType) },
    { label: "Vibe", value: asText(preferences.vibe) },
  ].filter((facet) => facet.value);
  return { likes: asList(preferences.likes), avoids: asList(preferences.dislikes), dietary: asList(preferences.dietaryNeeds), facets };
}

export function hasTaste(taste: TastePicture): boolean {
  return taste.likes.length + taste.avoids.length + taste.dietary.length + taste.facets.length > 0;
}

/** What is still open, so the page can say what to do next. */
export function openQuestions(input: { durationDays?: number | null; preferences: Record<string, unknown>; savedCount: number }): string[] {
  return [
    input.durationDays ? null : "How many days is the trip?",
    input.preferences.budget === undefined ? "What's a rough daily budget?" : null,
    asText(input.preferences.pace) ? null : "How packed should the days be?",
    input.savedCount === 0 ? "Nothing saved yet. Start with Discover or Roam." : null,
  ].filter((question): question is string => question !== null);
}

export type PlanDay = { day: number; items: string[]; label: string | null };

/** "Mon, Oct 12" for day N of a trip starting on `startDate`. Parsed as local time so no timezone shifts the day. */
export function dayLabel(startDate: string | null | undefined, day: number): string | null {
  if (!startDate) return null;
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** The first `limit` days that have something planned, each with its items in order. */
export function planDays(
  itinerary: Array<{ title: string; day_index: number; position?: number | null }>,
  startDate: string | null | undefined,
  limit = 3,
): PlanDay[] {
  const byDay = new Map<number, Array<{ title: string; position: number }>>();
  for (const item of itinerary) {
    const list = byDay.get(item.day_index) ?? [];
    list.push({ title: item.title, position: item.position ?? 0 });
    byDay.set(item.day_index, list);
  }
  return [...byDay.keys()]
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map((day) => ({
      day,
      label: dayLabel(startDate, day),
      items: byDay.get(day)!.sort((a, b) => a.position - b.position).map((item) => item.title),
    }));
}

/** First photo name on a saved place, if the place was saved with photos. */
export function placePhotoName(place: { metadata?: unknown } | undefined | null): string | undefined {
  const names = (place?.metadata as { photoNames?: unknown } | undefined)?.photoNames;
  return Array.isArray(names) ? names.find((name): name is string => typeof name === "string" && name.length > 0) : undefined;
}

/** "tourist_attraction" -> "Tourist attraction". */
export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  const text = category.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
