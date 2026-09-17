const DAY = 864e5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const futureDate = (value?: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value > iso(Date.now()) ? value : null);

/**
 * Resolve check-in/out for a stay search. Prefers explicit dates, then the
 * trip's own dates (`fallback`), then a 3-night stay ~6 weeks out — the last of
 * which is flagged `assumed` so the UI and assistant can say the dates are an
 * example.
 */
export function resolveStayDates(
  checkin?: string | null,
  checkout?: string | null,
  fallback?: { checkin?: string | null; checkout?: string | null },
): { checkin: string; checkout: string; assumed: boolean } {
  const explicitIn = futureDate(checkin);
  const tripIn = futureDate(fallback?.checkin);
  const ci = explicitIn ?? tripIn ?? iso(Date.now() + 42 * DAY);
  const assumed = !explicitIn && !tripIn;

  const explicitOut = !assumed && checkout && checkout > ci ? checkout : null;
  const tripOut = !explicitIn && tripIn && fallback?.checkout && fallback.checkout > ci ? fallback.checkout : null;
  const co = explicitOut ?? tripOut ?? iso(Date.parse(ci) + 3 * DAY);
  return { checkin: ci, checkout: co, assumed };
}

/** The Stays tab's filters when the user hasn't touched any filter control — what a
 *  chat-triggered stay search should key its cache under, so the two can actually share a hit
 *  instead of silently missing under two differently-shaped keys. */
export const DEFAULT_STAY_FILTERS = { starRatings: [] as number[], boards: [] as string[], refundableOnly: false, sort: "price" as const, propertyTypes: [] as string[] };

/** One cache key format for a stay search, shared by the Stays tab route and the chat "stays"
 *  tool branch — so a chat ask for a hotel right after (or before) browsing the tab reuses the
 *  same cached search instead of each keying it differently and never colliding. */
export function staysCacheKey(params: {
  location: string;
  checkin: string;
  checkout: string;
  adults: number | string;
  rooms: number | string;
  currency: string;
  filters: Record<string, unknown>;
}): string {
  return `stays-tab:${params.location}:${params.checkin}:${params.checkout}:${params.adults}:${params.rooms}:${params.currency}:${JSON.stringify(params.filters)}`;
}
