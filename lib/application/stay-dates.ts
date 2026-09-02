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
