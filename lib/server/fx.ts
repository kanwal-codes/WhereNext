import { cached } from "@/lib/server/ttl-cache";
import { guardedFetch } from "@/lib/server/provider-guard";
import { withProviderTimeout } from "@/packages/providers/request-signal";
import { roundMoney } from "@/lib/currency";
import type { FlightOffer } from "@/packages/providers/duffel/client";

/** Reference rates move once a day, so six hours is as fresh as they get. */
const FX_TTL_MS = 6 * 60 * 60_000;

/**
 * How many `to` one `from` buys, from the European Central Bank's daily reference rates (Frankfurter, no key).
 * null when the bank does not publish one of the two currencies (about thirty are) or the lookup fails:
 * the caller then keeps the amount in the currency it was priced in rather than guess.
 */
export async function fxRate(from: string, to: string, signal?: AbortSignal): Promise<number | null> {
  if (from === to) return 1;
  try {
    const { rate } = await cached(`fx:${from}:${to}`, FX_TTL_MS, async () => {
      const url = new URL("https://api.frankfurter.dev/v1/latest");
      url.searchParams.set("base", from);
      url.searchParams.set("symbols", to);
      const res = await guardedFetch("frankfurter", url, { signal: withProviderTimeout(signal, 5_000) });
      if (!res.ok) throw new Error(`rate lookup failed: ${res.status}`);
      const rate = ((await res.json()) as { rates?: Record<string, number> }).rates?.[to];
      if (!(typeof rate === "number" && rate > 0)) throw new Error("no rate");
      return { rate };
    });
    return rate;
  } catch {
    return null;
  }
}

/**
 * Fares in the traveller's own currency. A converted fare keeps what the airline actually lists in `listedAmount` /
 * `listedCurrency`, so the screen can say it is an estimate. A fare whose currency has no rate is left as listed.
 */
export async function offersInCurrency(offers: FlightOffer[], target: string, signal?: AbortSignal): Promise<FlightOffer[]> {
  const currencies = [...new Set(offers.map((o) => o.priceCurrency).filter((c) => c !== target))];
  if (currencies.length === 0) return offers;
  const rates = new Map(await Promise.all(currencies.map(async (c) => [c, await fxRate(c, target, signal)] as const)));
  return offers.map((offer) => {
    const rate = rates.get(offer.priceCurrency);
    const amount = Number(offer.priceAmount);
    if (!rate || !Number.isFinite(amount)) return offer;
    return { ...offer, priceAmount: roundMoney(amount * rate).toFixed(2), priceCurrency: target, listedAmount: offer.priceAmount, listedCurrency: offer.priceCurrency };
  });
}
