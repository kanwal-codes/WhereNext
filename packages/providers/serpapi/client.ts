import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import type { FlightOffer } from "../duffel/client";

/**
 * Google Flights through SerpAPI: the real fares Google shows, in the currency asked for. Used for what the traveller
 * looks at; Duffel stays for booking, and is only a stand-in for search when no SerpAPI key is set.
 */
const API = "https://serpapi.com/search.json";
export const serpConfigured = () => Boolean(process.env.SERP_API_KEY);

type Params = Record<string, string | number | undefined>;

async function serp<T>(params: Params, signal?: AbortSignal): Promise<T> {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  url.searchParams.set("api_key", process.env.SERP_API_KEY ?? "");
  const response = await guardedFetch("serpapi", url, { signal: withProviderTimeout(signal, 25_000) });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  // "Google Flights hasn't returned any results for this query" is an answer, not a failure.
  if (body.error && /hasn'?t returned any results|no results/i.test(body.error)) return {} as T;
  if (!response.ok || body.error) throw new Error(`SerpAPI request failed: ${response.status}`); // never echo the URL: it carries the key
  return body;
}

export type FlightPlace = {
  /** What Google Flights takes as an end of the trip: a place id for a city, an IATA code for an airport. */
  id: string;
  label: string;
  detail: string;
  kind: string;
  airports: string[];
};

/** Cities and airports matching what is typed, as Google Flights itself would suggest them. */
export async function suggestFlightPlaces(query: string, signal?: AbortSignal): Promise<FlightPlace[]> {
  const body = await serp<{ suggestions?: Array<{ name?: string; type?: string; description?: string; id?: string; airports?: Array<{ id?: string }> }> }>({ engine: "google_flights_autocomplete", q: query, hl: "en" }, signal);
  return (body.suggestions ?? []).flatMap((s) =>
    s.id && s.name ? [{ id: s.id, label: s.name, detail: s.description ?? "", kind: s.type ?? "place", airports: (s.airports ?? []).map((a) => a.id).filter((id): id is string => Boolean(id)) }] : [],
  );
}

type Airport = { name?: string; id?: string; time?: string };
type Segment = { departure_airport?: Airport; arrival_airport?: Airport; duration?: number; airplane?: string; airline?: string; airline_logo?: string; travel_class?: string; flight_number?: string; legroom?: string; extensions?: string[]; often_delayed_by_over_30_min?: boolean };
type Group = {
  flights?: Segment[];
  layovers?: Array<{ id?: string; name?: string; duration?: number; overnight?: boolean }>;
  total_duration?: number;
  price?: number;
  airline_logo?: string;
  departure_token?: string;
  carbon_emissions?: { this_flight?: number; difference_percent?: number };
};
type SearchBody = {
  best_flights?: Group[];
  other_flights?: Group[];
  price_insights?: { lowest_price?: number; price_level?: string; typical_price_range?: [number, number] };
};

export type PriceInsights = { level: "low" | "typical" | "high"; lowest: number; typicalLow: number | null; typicalHigh: number | null };

/** "2026-11-15 16:00" → "2026-11-15T16:00:00" (a clock time at the airport, no zone). */
const clockIso = (value?: string) => (value ? `${value.replace(" ", "T")}:00` : "");
const unique = <T,>(items: T[]) => items.filter((item, i) => items.indexOf(item) === i);

/** The comforts Google lists for a flight ("Wi-Fi for a fee", "In-seat power & USB outlets", "On-demand video"), without its legroom and emissions lines. */
const comforts = (extensions?: string[]) => {
  const found = (extensions ?? []).filter((e) => /wi-?fi|power|usb|outlet|video|entertainment|stream/i.test(e) && !/carbon|emission/i.test(e)).slice(0, 4);
  return found.length ? found : undefined;
};

function toOffer(group: Group, currency: string): FlightOffer | null {
  const segments = group.flights ?? [];
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last || typeof group.price !== "number") return null;
  const airlines = unique(segments.map((s) => s.airline).filter((a): a is string => Boolean(a)));
  const numbers = segments.map((s) => s.flight_number).filter((n): n is string => Boolean(n));
  return {
    id: `serp:${numbers.join("-") || first.departure_airport?.time}:${first.departure_airport?.time}:${group.price}`,
    airline: airlines.length > 2 ? `${airlines[0]} + ${airlines.length - 1} more` : airlines.join(" · ") || "Airline",
    cabinClass: first.travel_class,
    priceAmount: group.price.toFixed(2),
    priceCurrency: currency,
    durationMinutes: group.total_duration ?? segments.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    stops: segments.length - 1,
    departAt: clockIso(first.departure_airport?.time),
    arriveAt: clockIso(last.arrival_airport?.time),
    originAirport: first.departure_airport?.id,
    destinationAirport: last.arrival_airport?.id,
    layoverAirports: (group.layovers ?? []).map((l) => l.id).filter((id): id is string => Boolean(id)),
    aircraft: unique(segments.map((s) => s.airplane).filter((a): a is string => Boolean(a))).join(", ") || undefined,
    logo: group.airline_logo ?? first.airline_logo,
    departureToken: group.departure_token,
    flightNumbers: numbers,
    legs: segments.flatMap((s, i) => {
      const from = s.departure_airport;
      const to = s.arrival_airport;
      if (!from?.id || !to?.id) return [];
      const wait = i < segments.length - 1 ? group.layovers?.[i] : undefined;
      return [{ from: from.id, fromName: from.name, departAt: clockIso(from.time), to: to.id, toName: to.name, arriveAt: clockIso(to.time), minutes: s.duration ?? 0, airline: s.airline, flightNumber: s.flight_number, aircraft: s.airplane, logo: s.airline_logo, legroom: s.legroom, amenities: comforts(s.extensions), oftenDelayed: s.often_delayed_by_over_30_min || undefined, layoverMinutes: wait?.duration, overnight: wait?.overnight || undefined }];
    }),
    co2Kg: group.carbon_emissions?.this_flight ? Math.round(group.carbon_emissions.this_flight / 1000) : undefined,
    co2Diff: group.carbon_emissions?.difference_percent,
    passengerIds: [],
  };
}

export type FlightSearchInput = { departureId: string; arrivalId: string; departureDate: string; returnDate?: string; currency: string; adults?: number; departureToken?: string };

/**
 * Flights for the days asked. With a return date the fares are round-trip totals and each outbound carries a
 * `departureToken`; pass that back (same input plus the token) to get the return flights it can be paired with.
 */
export async function searchGoogleFlights(input: FlightSearchInput, signal?: AbortSignal): Promise<{ offers: FlightOffer[]; insights: PriceInsights | null }> {
  const body = await serp<SearchBody>({
    engine: "google_flights",
    departure_id: input.departureId,
    arrival_id: input.arrivalId,
    outbound_date: input.departureDate,
    return_date: input.returnDate,
    type: input.returnDate ? 1 : 2,
    currency: input.currency,
    adults: Math.max(1, Math.min(input.adults ?? 1, 9)),
    departure_token: input.departureToken,
    hl: "en",
  }, signal);
  const offers: FlightOffer[] = [];
  const seen = new Set<string>();
  for (const group of [...(body.best_flights ?? []), ...(body.other_flights ?? [])]) {
    const offer = toOffer(group, input.currency);
    if (offer && !seen.has(offer.id)) {
      seen.add(offer.id);
      offers.push(offer);
    }
  }
  const raw = body.price_insights;
  const level = raw?.price_level;
  const insights: PriceInsights | null = raw?.lowest_price && (level === "low" || level === "typical" || level === "high")
    ? { level, lowest: raw.lowest_price, typicalLow: raw.typical_price_range?.[0] ?? null, typicalHigh: raw.typical_price_range?.[1] ?? null }
    : null;
  return { offers, insights };
}
