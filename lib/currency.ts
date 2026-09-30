/** The app's home currency — used until the trip has one of its own. */
export const DEFAULT_CURRENCY = "CAD";

const REGION_CURRENCY: Record<string, string> = {
  CA: "CAD", US: "USD", GB: "GBP", IN: "INR", AU: "AUD", NZ: "NZD", JP: "JPY", CH: "CHF",
  AE: "AED", SG: "SGD", MX: "MXN", BR: "BRL", ZA: "ZAR", CN: "CNY", HK: "HKD", KR: "KRW", TW: "TWD",
  TH: "THB", ID: "IDR", MY: "MYR", PH: "PHP", VN: "VND", TR: "TRY", SA: "SAR", QA: "QAR", KW: "KWD",
  IL: "ILS", EG: "EGP", NG: "NGN", KE: "KES", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", RU: "RUB", UA: "UAH",
  AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
};
const EURO = new Set(["FR", "DE", "ES", "IT", "PT", "NL", "BE", "AT", "IE", "GR", "FI", "LU", "SK", "SI", "EE", "LV", "LT", "MT", "CY", "HR"]);

/** The currency a traveller from this ISO country pays in, or undefined when we don't know it. */
export function currencyForCountry(country: string | undefined): string | undefined {
  const region = country?.toUpperCase();
  if (!region) return undefined;
  return EURO.has(region) ? "EUR" : REGION_CURRENCY[region];
}

/** Best-effort currency for a BCP-47 locale like "en-CA" — for a sensible default on trip creation. */
export function currencyForLocale(locale: string | undefined): string {
  return currencyForCountry(locale?.split("-")[1]) ?? DEFAULT_CURRENCY;
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

/**
 * Round to 2 decimal places without `.toFixed(2)`'s known binary-float rounding bug — e.g.
 * `(1.005).toFixed(2)` is `"1.00"`, not `"1.01"`, because 1.005 is actually stored as
 * 1.00499999999999989341... in IEEE754 double. The `Number.EPSILON` nudge before rounding is
 * the standard fix. Any caller that persists or bills a money amount should round through this
 * once, at the boundary, rather than let each consumer round (or not) independently — see the
 * expenses route, where the un-rounded amount used to be stored locally while Splitwise got a
 * separately (and sometimes differently) rounded one, permanently diverging the two records for
 * any amount typed with 3+ decimal places.
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
