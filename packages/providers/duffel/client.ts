import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

const API = "https://api.duffel.com";
const HEADERS = () => ({
  authorization: `Bearer ${process.env.DUFFEL_API_KEY}`,
  "duffel-version": "v2",
  accept: "application/json",
  "content-type": "application/json",
});

export type FlightOffer = {
  airline: string;
  priceAmount: string;
  priceCurrency: string;
  durationMinutes: number;
  stops: number;
  departAt: string;
  arriveAt: string;
};

const isoDurationToMinutes = (value?: string): number => {
  const match = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(value ?? "");
  if (!match) return 0;
  return (Number(match[1] ?? 0) * 24 * 60) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
};

const suggestionSchema = z.object({ data: z.array(z.object({ type: z.string().optional(), iata_code: z.string().nullable().optional() })).default([]) });

/** Resolve a city or airport name to an IATA code (prefers the metro/city code). */
async function resolveIata(query: string, signal?: AbortSignal): Promise<string | null> {
  const url = new URL(`${API}/places/suggestions`);
  url.searchParams.set("query", query.slice(0, 80));
  const response = await guardedFetch("duffel", url, { headers: HEADERS(), signal: withProviderTimeout(signal) });
  if (!response.ok) throw new Error(`Duffel place lookup failed: ${response.status}`);
  const data = suggestionSchema.parse(await response.json()).data;
  return (data.find((entry) => entry.type === "city" && entry.iata_code)?.iata_code
    ?? data.find((entry) => entry.iata_code)?.iata_code
    ?? null);
}

const offersSchema = z.object({
  data: z.array(z.object({
    total_amount: z.string(),
    total_currency: z.string(),
    owner: z.object({ name: z.string().optional() }).optional(),
    slices: z.array(z.object({
      duration: z.string().optional(),
      segments: z.array(z.object({ departing_at: z.string().optional(), arriving_at: z.string().optional() })).default([]),
    })).default([]),
  })).default([]),
});

/** Live one-way (or round-trip) flight offers, cheapest first. Dates are YYYY-MM-DD. */
export async function searchFlights(
  input: { origin: string; destination: string; departureDate: string; returnDate?: string; adults?: number },
  signal?: AbortSignal,
): Promise<FlightOffer[]> {
  if (!process.env.DUFFEL_API_KEY) throw new Error("DUFFEL_API_KEY is not configured");
  const [origin, destination] = await Promise.all([resolveIata(input.origin, signal), resolveIata(input.destination, signal)]);
  if (!origin || !destination) return [];

  const slices = [{ origin, destination, departure_date: input.departureDate }];
  if (input.returnDate) slices.push({ origin: destination, destination: origin, departure_date: input.returnDate });
  const requestResponse = await guardedFetch("duffel", `${API}/air/offer_requests`, {
    method: "POST",
    headers: HEADERS(),
    body: JSON.stringify({
      data: {
        slices,
        passengers: Array.from({ length: Math.max(1, Math.min(input.adults ?? 1, 9)) }, () => ({ type: "adult" })),
        cabin_class: "economy",
        max_connections: 1,
      },
    }),
    signal: withProviderTimeout(signal),
  });
  if (!requestResponse.ok) throw new Error(`Duffel offer request failed: ${requestResponse.status}`);
  const requestId = (await requestResponse.json() as { data?: { id?: string } }).data?.id;
  if (!requestId) return [];

  const offersUrl = new URL(`${API}/air/offers`);
  offersUrl.searchParams.set("offer_request_id", requestId);
  offersUrl.searchParams.set("sort", "total_amount");
  offersUrl.searchParams.set("limit", "10");
  const offersResponse = await guardedFetch("duffel", offersUrl, { headers: HEADERS(), signal: withProviderTimeout(signal) });
  if (!offersResponse.ok) throw new Error(`Duffel offers fetch failed: ${offersResponse.status}`);
  return offersSchema.parse(await offersResponse.json()).data.flatMap((offer) => {
    const slice = offer.slices[0];
    const segments = slice?.segments ?? [];
    if (segments.length === 0) return [];
    return [{
      airline: offer.owner?.name ?? "Airline",
      priceAmount: offer.total_amount,
      priceCurrency: offer.total_currency,
      durationMinutes: isoDurationToMinutes(slice?.duration),
      stops: segments.length - 1,
      departAt: segments[0].departing_at ?? "",
      arriveAt: segments[segments.length - 1].arriving_at ?? "",
    }];
  });
}
