import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

export type PlaceHours = { lines?: string[]; closedForGood: boolean };

/** Most places a plan looks up: a plan holds about 3 stops a day, so this covers about a week; later days go unchecked. */
const MAX_LOOKUPS = 24;

/**
 * Opening hours and trading status for the places a drafted plan actually uses, looked up side by side, once each (cached for hours).
 * A lookup that fails or runs out of time just leaves that place out: an unchecked stop stays in the plan.
 */
export async function lookUpHours(placeIds: readonly string[], signal: AbortSignal): Promise<Map<string, PlaceHours>> {
  const provider = new GooglePlacesProvider();
  const found = await Promise.all([...new Set(placeIds)].slice(0, MAX_LOOKUPS).map(async (id): Promise<[string, PlaceHours] | null> => {
    try {
      const { lines, status } = await provider.openingHours(id, signal);
      return [id, { lines, closedForGood: status === "CLOSED_PERMANENTLY" }];
    } catch {
      return null;
    }
  }));
  return new Map(found.flatMap((entry) => (entry ? [entry] : [])));
}
