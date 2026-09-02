/** The app's home currency — used until the trip has one of its own. */
export const DEFAULT_CURRENCY = "CAD";

const REGION_CURRENCY: Record<string, string> = {
  CA: "CAD", US: "USD", GB: "GBP", IN: "INR", AU: "AUD", NZ: "NZD", JP: "JPY", CH: "CHF",
  AE: "AED", SG: "SGD", MX: "MXN", BR: "BRL", ZA: "ZAR",
};
const EURO = new Set(["FR", "DE", "ES", "IT", "PT", "NL", "BE", "AT", "IE", "GR", "FI"]);

/** Best-effort currency for a BCP-47 locale like "en-CA" — for a sensible default on trip creation. */
export function currencyForLocale(locale: string | undefined): string {
  const region = locale?.split("-")[1]?.toUpperCase();
  if (!region) return DEFAULT_CURRENCY;
  if (EURO.has(region)) return "EUR";
  return REGION_CURRENCY[region] ?? DEFAULT_CURRENCY;
}

/** The currency to price a trip in: the trip's own, else the app default. */
export function resolveCurrency(preferences: Record<string, unknown> | null | undefined): string {
  const c = preferences?.currency;
  return typeof c === "string" && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : DEFAULT_CURRENCY;
}

/** "$1,240" / "CA$1,240" style, falling back to "1240 CAD" if the runtime can't format the code. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}
