const DAY = 864e5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Resolve check-in/out for a stay search. Honours a valid future date pair;
 * otherwise assumes a 3-night stay ~6 weeks out and flags it so the UI and the
 * assistant can say the dates are an example.
 */
export function resolveStayDates(checkin?: string | null, checkout?: string | null): { checkin: string; checkout: string; assumed: boolean } {
  const today = iso(Date.now());
  const assumed = !checkin || checkin <= today;
  const ci = assumed ? iso(Date.now() + 42 * DAY) : checkin!;
  const co = !assumed && checkout && checkout > ci ? checkout : iso(Date.parse(ci) + 3 * DAY);
  return { checkin: ci, checkout: co, assumed };
}
