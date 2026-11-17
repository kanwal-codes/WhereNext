import type { StayOption } from "./stay";

/** What a traveller can narrow a stay list by, and the order they want it in. */
export type StayFilters = {
  starRatings?: number[];
  boards?: string[];
  refundableOnly?: boolean;
  priceMin?: number;
  priceMax?: number;
  propertyTypes?: string[];
  sort?: "price" | "price_desc" | "rating" | "stars";
};

/** True when any filter (not the order) would drop a hotel. */
export const hasStayFilters = (f: StayFilters): boolean =>
  Boolean(f.starRatings?.length || f.boards?.length || f.refundableOnly || typeof f.priceMin === "number" || typeof f.priceMax === "number" || f.propertyTypes?.length);

/**
 * The list a traveller's filters and order leave of a priced set. One function for the two hotel providers, the search route and the
 * browser: the filters only ever choose among hotels already priced, so changing one is arithmetic, never a new search.
 */
export function applyStayFilters(options: StayOption[], f: StayFilters): StayOption[] {
  let list = options;
  if (f.starRatings?.length) list = list.filter((o) => o.stars != null && f.starRatings!.includes(Math.round(o.stars)));
  if (f.boards?.length) list = list.filter((o) => o.rooms.some((r) => r.boardName && f.boards!.includes(r.boardName)) || (o.boardName != null && f.boards!.includes(o.boardName)));
  if (f.refundableOnly) list = list.filter((o) => o.refundable || o.rooms.some((r) => r.refundable));
  if (typeof f.priceMin === "number") list = list.filter((o) => o.nightlyAmount >= f.priceMin!);
  if (typeof f.priceMax === "number") list = list.filter((o) => o.nightlyAmount <= f.priceMax!);
  if (f.propertyTypes?.length) list = list.filter((o) => o.propertyType && f.propertyTypes!.includes(o.propertyType));
  const sort = f.sort ?? "price";
  return [...list].sort((a, b) =>
    sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0)
    : sort === "stars" ? (b.stars ?? 0) - (a.stars ?? 0)
    : sort === "price_desc" ? b.nightlyAmount - a.nightlyAmount
    : a.nightlyAmount - b.nightlyAmount,
  );
}
