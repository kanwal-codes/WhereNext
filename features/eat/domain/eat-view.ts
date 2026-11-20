import type { Place } from "@/packages/contracts/place";
import { priceRank } from "@/lib/places-ui";

/** What the Eat page shows of the places it found: filtered (open now, price, rating), then sorted. The places themselves come from Discover's "Eat & Drink" search. */
export type EatSort = "pick" | "rating" | "price";
export type EatView = { sort: EatSort; openNow: boolean; prices: number[]; minRating: number | null };

export const DEFAULT_EAT_VIEW: EatView = { sort: "pick", openNow: false, prices: [], minRating: null };
export const EAT_SORTS: Array<{ id: EatSort; label: string }> = [
  { id: "pick", label: "Roam’s pick" },
  { id: "rating", label: "Best rated" },
  { id: "price", label: "Lowest price" },
];
export const RATING_STEPS = [3.5, 4, 4.5] as const;

type Row = { place: Place };

/** Rank 1–4 for $ to $$$$, or 0 when the place has no price. */
const rankOf = (p: Place) => { const r = priceRank(p.priceLevel); return r >= 1 && r <= 4 ? r : 0; };

/** Filtered, then sorted. "Roam’s pick" keeps the order the places came in; ties elsewhere keep it too. */
export function applyEatView<T extends Row>(rows: T[], view: EatView): T[] {
  const kept = rows.filter(({ place: p }) =>
    (!view.openNow || p.openNow === true) &&
    (view.prices.length === 0 || view.prices.includes(rankOf(p))) &&
    (view.minRating === null || (p.rating ?? 0) >= view.minRating));
  if (view.sort === "pick") return kept;
  const key = (p: Place) => (view.sort === "rating" ? -(p.rating ?? 0) : rankOf(p) === 0 ? 99 : rankOf(p));
  return kept.map((r, i) => ({ r, i })).sort((a, b) => key(a.r.place) - key(b.r.place) || (view.sort === "rating" ? (b.r.place.userRatingCount ?? 0) - (a.r.place.userRatingCount ?? 0) : 0) || a.i - b.i).map(({ r }) => r);
}

/** How many filters are on (the sort is not a filter). */
export const activeEatFilters = (v: EatView) => Number(v.openNow) + v.prices.length + Number(v.minRating !== null);

/** Only the filters that would change what is shown: one every place passes (or fails) is noise. */
export function availableEat(rows: Row[]) {
  const ranks = [...new Set(rows.map((r) => rankOf(r.place)).filter((n) => n > 0))].sort();
  const open = rows.filter((r) => r.place.openNow === true).length;
  return {
    prices: ranks.length > 1 ? ranks : [],
    openNow: open > 0 && open < rows.length,
    ratings: rows.some((r) => (r.place.rating ?? 0) >= RATING_STEPS[0]) && rows.some((r) => (r.place.rating ?? 5) < RATING_STEPS[2]),
  };
}

/** "$", "$$", … for a rank. */
export const dollars = (rank: number) => "$".repeat(rank);
