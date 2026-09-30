import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { FilterDef, SortDef } from "./ListControls";

type StayItem = Extract<AssistantBlock, { type: "stays" }>["items"][number];
type EventItem = Extract<AssistantBlock, { type: "events" }>["items"][number];

/** "400 m from the British Museum" -> 400; "1.4 km from ..." -> 1400; anything else -> undefined. */
export function parseDistanceM(text?: string): number | undefined {
  const m = text?.match(/^\s*([\d.,]+)\s*(km|m)\b/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? (m[2].toLowerCase() === "km" ? n * 1000 : n) : undefined;
}

const hasBreakfast = (s: StayItem) => Boolean(s.board && !/room only|^ro$/i.test(s.board) && /breakfast|\bbb\b|half|full|all.?inclusive/i.test(s.board));

// ---- stays ---------------------------------------------------------------------------------------------

export type StayView = { sort: "recommended" | "price" | "rating" | "closest"; refundable: boolean; breakfast: boolean; stars4: boolean };
export const DEFAULT_STAY_VIEW: StayView = { sort: "recommended", refundable: false, breakfast: false, stars4: false };

export function applyStayView(items: StayItem[], v: StayView): StayItem[] {
  const shown = items.filter((s) => (!v.refundable || s.refundable) && (!v.breakfast || hasBreakfast(s)) && (!v.stars4 || (s.stars ?? 0) >= 4));
  const key = (s: StayItem): number => (v.sort === "price" ? Number(s.nightlyPrice) : v.sort === "rating" ? -(s.rating ?? -1) : v.sort === "closest" ? parseDistanceM(s.distanceToLocked) ?? Infinity : 0);
  return shown.map((s, i) => ({ s, i })).sort((a, b) => (key(a.s) - key(b.s) || a.i - b.i)).map(({ s }) => s);
}

/** Only the sorts and filters that would change the list. */
export function stayControls(items: StayItem[], v: StayView, set: (v: StayView) => void): { sorts: SortDef[]; filters: FilterDef[] } {
  const some = (f: (s: StayItem) => boolean) => items.some(f) && items.some((s) => !f(s));
  // A sort is offered only if it would reorder what is already shown.
  const reorders = (sort: StayView["sort"]) => applyStayView(items, { ...DEFAULT_STAY_VIEW, sort }).some((s, i) => s !== items[i]);
  const sorts: SortDef[] = [{ id: "recommended", label: "Recommended" }];
  if (reorders("price")) sorts.push({ id: "price", label: "Cheapest" });
  if (items.filter((s) => typeof s.rating === "number").length > 1 && reorders("rating")) sorts.push({ id: "rating", label: "Best rated" });
  if (items.filter((s) => parseDistanceM(s.distanceToLocked) !== undefined).length > 1 && reorders("closest")) sorts.push({ id: "closest", label: "Closest" });
  const filters: FilterDef[] = [];
  if (some((s) => Boolean(s.refundable))) filters.push({ id: "refundable", label: "Refundable", active: v.refundable, onToggle: () => set({ ...v, refundable: !v.refundable }) });
  if (some(hasBreakfast)) filters.push({ id: "breakfast", label: "Breakfast included", active: v.breakfast, onToggle: () => set({ ...v, breakfast: !v.breakfast }) });
  if (some((s) => (s.stars ?? 0) >= 4)) filters.push({ id: "stars4", label: "4-star and up", active: v.stars4, onToggle: () => set({ ...v, stars4: !v.stars4 }) });
  return { sorts, filters };
}

// ---- events --------------------------------------------------------------------------------------------

export type EventView = { sort: "relevance" | "soonest"; duringTrip: boolean; venue: string | null };
export const DEFAULT_EVENT_VIEW: EventView = { sort: "relevance", duringTrip: false, venue: null };

const when = (e: EventItem) => {
  const t = e.date ? Date.parse(e.date.replace(" ", "T")) : NaN;
  return Number.isNaN(t) ? Infinity : t;
};

export function applyEventView(items: EventItem[], v: EventView): EventItem[] {
  const shown = items.filter((e) => (!v.duringTrip || e.relToTrip === "in") && (!v.venue || e.venue === v.venue));
  return shown.map((e, i) => ({ e, i })).sort((a, b) => (v.sort === "soonest" ? when(a.e) - when(b.e) : 0) || a.i - b.i).map(({ e }) => e);
}

export function eventControls(items: EventItem[], v: EventView, set: (v: EventView) => void): { sorts: SortDef[]; filters: FilterDef[] } {
  const inTrip = items.filter((e) => e.relToTrip === "in").length;
  const venues = [...new Set(items.map((e) => e.venue).filter((x): x is string => Boolean(x)))];
  const soonestReorders = applyEventView(items, { ...DEFAULT_EVENT_VIEW, sort: "soonest" }).some((e, i) => e !== items[i]);
  const sorts: SortDef[] = soonestReorders ? [{ id: "relevance", label: "Recommended" }, { id: "soonest", label: "Soonest" }] : [];
  const filters: FilterDef[] = [];
  if (inTrip > 0 && inTrip < items.length) filters.push({ id: "trip", label: "During your trip", active: v.duringTrip, onToggle: () => set({ ...v, duringTrip: !v.duringTrip }) });
  if (venues.length > 1 && venues.length <= 3) {
    for (const venue of venues) filters.push({ id: `venue:${venue}`, label: venue.length > 22 ? `${venue.slice(0, 21)}…` : venue, active: v.venue === venue, onToggle: () => set({ ...v, venue: v.venue === venue ? null : venue }) });
  }
  return { sorts, filters };
}
