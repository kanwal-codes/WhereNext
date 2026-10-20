import { type Placement, placementDay } from "@/packages/contracts/placement";

/** How many day rows the menu will ever show (a trip longer than this still works — the extra days just aren't offered here). */
export const MAX_DAY_ROWS = 30;

export type SavedRow = { places?: { provider_id?: string } | null; provider_id?: string; providerId?: string };
export type ItineraryRow = { title?: string; day_index?: number };

export const samePlacement = (a: Placement, b: Placement) => JSON.stringify(a) === JSON.stringify(b);
const norm = (s: string) => s.trim().toLowerCase();

/** Whether a place is on the shortlist, whichever shape the saved-place row came in. */
export function isSaved(savedPlaces: SavedRow[], providerId: string) {
  return savedPlaces.some((s) => (s.places?.provider_id ?? s.provider_id ?? s.providerId) === providerId);
}

/** What was done to the place, as a sentence. */
export function placementToast(name: string, placement: Placement): string {
  const day = placementDay(placement);
  if (day) return `${name} added to Day ${day}.`;
  if (placement === "shortlist") return `${name} shortlisted.`;
  return `Removed ${name} from the trip.`;
}

/** Where the trip says a place stands: on a day (found by name in the itinerary), on the shortlist, or not in it. */
export function derivePlacement(input: { initialPlacement?: Placement; itinerary: ItineraryRow[]; savedPlaces: SavedRow[]; place: { name: string; providerId: string } }): Placement {
  const { initialPlacement, itinerary, savedPlaces, place } = input;
  if (initialPlacement) return initialPlacement;
  const item = itinerary.find((i) => i.title && norm(i.title) === norm(place.name));
  if (item) return { dayIndex: Number(item.day_index) || 1 };
  return isSaved(savedPlaces, place.providerId) ? "shortlist" : "none";
}

/** How many days the menu offers: the trip's length, or the latest day anything is already on, up to the cap. */
export function dayRowCount(tripDays: number, itinerary: ItineraryRow[]): number {
  const maxItinDay = itinerary.reduce((m, i) => Math.max(m, Number(i.day_index) || 0), 0);
  return Math.min(Math.max(tripDays, maxItinDay), MAX_DAY_ROWS);
}

/** Where the day menu goes: under the control, or above it when there is little room below; its right edge on the control's, kept on screen. */
export function menuPlacement(rect: { top: number; bottom: number; right: number }, viewport: { width: number; height: number }, menuWidth = 240) {
  const up = rect.bottom > viewport.height - 300;
  return {
    top: up ? Math.max(8, rect.top - 6) : rect.bottom + 6,
    left: Math.min(Math.max(8, rect.right - menuWidth), viewport.width - menuWidth - 8),
    up,
  };
}
