import { cached } from "@/lib/server/ttl-cache";
import { offersInCurrency } from "@/lib/server/fx";
import { searchFlights as searchDuffel, type FlightOffer } from "@/packages/providers/duffel/client";
import { searchGoogleFlights, serpConfigured, suggestFlightPlaces, type FlightPlace, type PriceInsights } from "@/packages/providers/serpapi/client";

/** One end of a flight: the id Google Flights searches by, and the name to show. */
export type FlightEnd = { id: string; label: string };

export type FlightQuery = {
  origin: string;
  destination: string;
  /** When the traveller picked from the suggestions these are known; otherwise the text is looked up. */
  originId?: string;
  destinationId?: string;
  departureDate: string;
  returnDate?: string;
  currency: string;
  adults?: number;
  /** "duffel" keeps the old bookable search (the Getting around page books through it); default is the real fares. */
  provider?: "serpapi" | "duffel";
};

export type FlightSearchResult = {
  offers: FlightOffer[];
  insights: PriceInsights | null;
  provider: "serpapi" | "duffel";
  from: FlightEnd | null;
  to: FlightEnd | null;
};

const DAY = 24 * 60 * 60_000;

/** Cities and airports for a typed name. A day's cache: a place's name for its airport does not change. */
export const flightPlaces = (query: string, signal?: AbortSignal): Promise<FlightPlace[]> =>
  cached(`flights:places:${query.trim().toLowerCase()}`, DAY, () => suggestFlightPlaces(query.trim(), signal));

/** The Google Flights id for a typed place: a known id, a bare airport code, or the best suggestion for the text. */
export async function resolveEnd(text: string, knownId?: string, signal?: AbortSignal): Promise<FlightEnd | null> {
  const label = text.trim();
  if (knownId) return { id: knownId, label };
  if (label.length < 2) return null;
  if (/^[A-Za-z]{3}$/.test(label)) return { id: label.toUpperCase(), label: label.toUpperCase() };
  const options = await flightPlaces(label, signal).catch(() => []);
  const pick = options.find((o) => o.label.toLowerCase() === label.toLowerCase()) ?? options.find((o) => o.label.toLowerCase().startsWith(label.toLowerCase())) ?? options[0];
  return pick ? { id: pick.id, label: pick.label } : null;
}

/** Flights for the days asked, in the traveller's currency. Real Google Flights fares when a SerpAPI key is set, else Duffel. */
export async function searchFlightOffers(query: FlightQuery, signal?: AbortSignal): Promise<FlightSearchResult> {
  if (query.provider !== "duffel" && serpConfigured()) {
    const [from, to] = await Promise.all([resolveEnd(query.origin, query.originId, signal), resolveEnd(query.destination, query.destinationId, signal)]);
    if (!from || !to) return { offers: [], insights: null, provider: "serpapi", from, to };
    const key = `flights:serp:${from.id}:${to.id}:${query.departureDate}:${query.returnDate ?? ""}:${query.currency}:${query.adults ?? 1}`;
    const { offers, insights } = await cached(key, 10 * 60_000, () =>
      searchGoogleFlights({ departureId: from.id, arrivalId: to.id, departureDate: query.departureDate, returnDate: query.returnDate, currency: query.currency, adults: query.adults }),
    );
    return { offers, insights, provider: "serpapi", from, to };
  }
  const key = `flights:duffel:${query.origin}:${query.destination}:${query.departureDate}:${query.returnDate ?? ""}:${query.adults ?? 1}`;
  const found = await cached(key, 10 * 60_000, () => searchDuffel({ origin: query.origin, destination: query.destination, departureDate: query.departureDate, returnDate: query.returnDate, adults: query.adults }, signal));
  return { offers: await offersInCurrency(found, query.currency, signal), insights: null, provider: "duffel", from: null, to: null };
}

/** The return flights that pair with one outbound of a round-trip search (its `departureToken`), priced as the round trip. */
export async function searchReturnOffers(query: FlightQuery & { departureToken: string; originId: string; destinationId: string }): Promise<FlightOffer[]> {
  const key = `flights:serp-return:${query.departureToken}:${query.currency}`;
  const { offers } = await cached(key, 10 * 60_000, () =>
    searchGoogleFlights({ departureId: query.originId, arrivalId: query.destinationId, departureDate: query.departureDate, returnDate: query.returnDate, currency: query.currency, adults: query.adults, departureToken: query.departureToken }),
  );
  return offers;
}
