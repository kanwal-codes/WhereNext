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

/** One flight within a journey, and the wait before the next one. Google Flights supplies these; the airports are named for people, the codes for searches. */
export type FlightLeg = {
  from: string;
  fromName?: string;
  departAt: string;
  to: string;
  toName?: string;
  arriveAt: string;
  minutes: number;
  airline?: string;
  flightNumber?: string;
  aircraft?: string;
  /** That airline's own logo, seat legroom ("30 in"), the comforts listed for the flight (Wi-Fi, power, entertainment), and whether it is often late. */
  logo?: string;
  legroom?: string;
  amenities?: string[];
  oftenDelayed?: boolean;
  /** The wait at `to` before the next leg, and whether it runs through the night. */
  layoverMinutes?: number;
  overnight?: boolean;
};

export type FlightOffer = {
  id: string;
  airline: string;
  operatingAirline?: string;
  cabinClass?: string;
  priceAmount: string;
  priceCurrency: string;
  /** Set when `priceAmount` was converted into the traveller's currency: what the airline actually lists. */
  listedAmount?: string;
  listedCurrency?: string;
  durationMinutes: number;
  stops: number;
  departAt: string;
  arriveAt: string;
  originAirport?: string;
  destinationAirport?: string;
  baggage?: string;
  layoverAirports?: string[];
  aircraft?: string;
  fareConditions?: string[];
  expiresAt?: string;
  /** Airline logo, flight numbers and CO₂ estimate, when the search provider supplies them (Google Flights does). */
  logo?: string;
  flightNumbers?: string[];
  co2Kg?: number;
  co2Diff?: number;
  /** Google Flights: hand back to fetch the return flights this outbound pairs with. */
  departureToken?: string;
  /** Each flight of the journey, in order. */
  legs?: FlightLeg[];
  /** A round trip: the flights home, in order (the price covers both ways). */
  returnLegs?: FlightLeg[];
  /** Duffel passenger ids (`pas_...`) this offer was priced for — required to book it. */
  passengerIds: string[];
};

export type BookingPassenger = {
  id: string;
  title: string;
  givenName: string;
  familyName: string;
  bornOn: string;
  gender: string;
  email: string;
  phoneNumber: string;
};
export type FlightOrder = { orderId: string; bookingReference: string; status: string; totalAmount: string; totalCurrency: string; raw: unknown };

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
    id: z.string().optional(),
    total_amount: z.string(),
    total_currency: z.string(),
    expires_at: z.string().optional(),
    // Duffel sends explicit `null` (not just an absent key) for any of these when the airline
    // hasn't supplied that detail — `.optional()` alone rejects `null`, so every one of these
    // nested objects needs `.nullable()` too or a real offer with an unset field 400s the whole search.
    owner: z.object({ name: z.string().optional(), logo_symbol_url: z.string().nullable().optional() }).nullable().optional(),
    slices: z.array(z.object({
      duration: z.string().optional(),
      segments: z.array(z.object({
        departing_at: z.string().optional(),
        arriving_at: z.string().optional(),
        origin: z.object({ iata_code: z.string().optional(), name: z.string().nullable().optional() }).nullable().optional(),
        destination: z.object({ iata_code: z.string().optional(), name: z.string().nullable().optional() }).nullable().optional(),
        duration: z.string().nullable().optional(),
        marketing_carrier_flight_number: z.string().nullable().optional(),
        marketing_carrier: z.object({ name: z.string().optional(), iata_code: z.string().nullable().optional() }).nullable().optional(),
        operating_carrier: z.object({ name: z.string().optional() }).nullable().optional(),
        aircraft: z.object({ name: z.string().optional() }).nullable().optional(),
      })).default([]),
    })).default([]),
    conditions: z.object({
      change_before_departure: z.object({ allowed: z.boolean().optional() }).nullable().optional(),
      refund_before_departure: z.object({ allowed: z.boolean().optional() }).nullable().optional(),
    }).nullable().optional(),
    passengers: z.array(z.object({
      id: z.string().optional(),
      cabin_class: z.string().optional(),
      baggages: z.array(z.object({ type: z.string().optional(), quantity: z.number().optional() })).default([]),
    })).default([]),
  })).default([]),
});

type Segment = z.infer<typeof offersSchema>["data"][number]["slices"][number]["segments"][number];

/** Minutes from one wall-clock time to another (airport-local times with no zone: only a difference at one airport is meaningful). */
const minutesBetween = (from?: string, to?: string) => {
  const a = Date.parse(`${from ?? ""}Z`);
  const b = Date.parse(`${to ?? ""}Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 60_000) : undefined;
};

/** The flights of one direction, with the wait at each connection. */
export function legsOfSegments(segments: Segment[]): FlightLeg[] {
  return segments.flatMap((seg, i) => {
    if (!seg.origin?.iata_code || !seg.destination?.iata_code || !seg.departing_at || !seg.arriving_at) return [];
    const layover = minutesBetween(seg.arriving_at, segments[i + 1]?.departing_at);
    const number = seg.marketing_carrier_flight_number;
    return [{
      from: seg.origin.iata_code,
      ...(seg.origin.name ? { fromName: seg.origin.name } : {}),
      departAt: seg.departing_at,
      to: seg.destination.iata_code,
      ...(seg.destination.name ? { toName: seg.destination.name } : {}),
      arriveAt: seg.arriving_at,
      minutes: isoDurationToMinutes(seg.duration ?? undefined),
      ...(seg.marketing_carrier?.name ? { airline: seg.marketing_carrier.name } : {}),
      ...(number ? { flightNumber: `${seg.marketing_carrier?.iata_code ?? ""} ${number}`.trim() } : {}),
      ...(seg.aircraft?.name ? { aircraft: seg.aircraft.name } : {}),
      ...(layover !== undefined && layover > 0 ? { layoverMinutes: layover, overnight: (seg.arriving_at ?? "").slice(0, 10) !== (segments[i + 1]?.departing_at ?? "").slice(0, 10) } : {}),
    }];
  });
}

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
      id: offer.id ?? `${segments[0].departing_at ?? "offer"}-${offer.total_amount}`,
      airline: offer.owner?.name ?? "Airline",
      operatingAirline: segments[0].operating_carrier?.name,
      cabinClass: offer.passengers[0]?.cabin_class,
      priceAmount: offer.total_amount,
      priceCurrency: offer.total_currency,
      durationMinutes: isoDurationToMinutes(slice?.duration),
      stops: segments.length - 1,
      departAt: segments[0].departing_at ?? "",
      arriveAt: segments[segments.length - 1].arriving_at ?? "",
      originAirport: segments[0].origin?.iata_code,
      destinationAirport: segments[segments.length - 1].destination?.iata_code,
      baggage: offer.passengers[0]?.baggages.length
        ? offer.passengers[0].baggages.map((bag) => `${bag.quantity ?? 0} ${bag.type ?? "bag"}`).join(", ")
        : undefined,
      layoverAirports: segments.slice(0, -1).map((segment) => segment.destination?.iata_code).filter((code): code is string => Boolean(code)),
      aircraft: segments.map((segment) => segment.aircraft?.name).filter((name): name is string => Boolean(name)).filter((name, index, all) => all.indexOf(name) === index).join(", ") || undefined,
      fareConditions: [
        offer.conditions?.change_before_departure?.allowed === true ? "Changes allowed" : offer.conditions?.change_before_departure?.allowed === false ? "Changes not allowed" : undefined,
        offer.conditions?.refund_before_departure?.allowed === true ? "Refunds allowed" : offer.conditions?.refund_before_departure?.allowed === false ? "Refunds not allowed" : undefined,
      ].filter((condition): condition is string => Boolean(condition)),
      expiresAt: offer.expires_at,
      ...(offer.owner?.logo_symbol_url ? { logo: offer.owner.logo_symbol_url } : {}),
      legs: legsOfSegments(segments),
      ...(offer.slices[1]?.segments.length ? { returnLegs: legsOfSegments(offer.slices[1].segments) } : {}),
      passengerIds: offer.passengers.map((p) => p.id).filter((id): id is string => Boolean(id)),
    }];
  });
}

/**
 * Book a searched offer. `offerId`/`passengerIds` come straight from the matching `FlightOffer` —
 * Duffel ties passenger records to ids minted for that specific offer request, so they can't be
 * invented at booking time. Pays with a `balance` payment: in test mode Duffel auto-funds this
 * (no card needed); going live needs real balance funding or Duffel's own card Components instead.
 */
export async function createOrder(offerId: string, passengerIds: string[], passengers: BookingPassenger[], signal?: AbortSignal): Promise<FlightOrder> {
  if (!process.env.DUFFEL_API_KEY) throw new Error("DUFFEL_API_KEY is not configured");
  const byId = new Map(passengers.map((p) => [p.id, p]));
  const orderPassengers = passengerIds.map((id) => {
    const p = byId.get(id);
    if (!p) throw new Error(`Missing passenger details for ${id}`);
    return { id: p.id, title: p.title, given_name: p.givenName, family_name: p.familyName, born_on: p.bornOn, gender: p.gender, email: p.email, phone_number: p.phoneNumber };
  });
  // Amount must match the offer exactly, so fetch it fresh rather than trust a client-supplied total.
  const offerResponse = await guardedFetch("duffel", `${API}/air/offers/${encodeURIComponent(offerId)}`, { headers: HEADERS(), signal: withProviderTimeout(signal) });
  if (!offerResponse.ok) throw new Error(`Duffel offer lookup failed: ${offerResponse.status}`);
  const offer = (await offerResponse.json() as { data?: { total_amount?: string; total_currency?: string } }).data;
  if (!offer?.total_amount || !offer.total_currency) throw new Error("Duffel offer is no longer available");

  const response = await guardedFetch("duffel", `${API}/air/orders`, {
    method: "POST",
    headers: HEADERS(),
    body: JSON.stringify({ data: { type: "instant", selected_offers: [offerId], passengers: orderPassengers, payments: [{ type: "balance", amount: offer.total_amount, currency: offer.total_currency }] } }),
    signal: withProviderTimeout(signal),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Duffel order creation failed: ${response.status} ${JSON.stringify(body.errors ?? body)}`);
  const order = body.data as { id: string; booking_reference: string; total_amount: string; total_currency: string; payment_status?: { paid_at?: string | null } };
  return { orderId: order.id, bookingReference: order.booking_reference, status: order.payment_status?.paid_at ? "confirmed" : "pending", totalAmount: order.total_amount, totalCurrency: order.total_currency, raw: body.data };
}

export type OrderCancellation = { status: "cancelled" | "pending"; refundAmount: string | null; refundCurrency: string | null };

/**
 * Cancel a confirmed order. Duffel is a quote-then-confirm flow: request a cancellation
 * (returns the refund quote), then confirm it — done together here since the UI keeps
 * cancellation to a single tap rather than a separate refund-preview step.
 */
export async function cancelOrder(orderId: string, signal?: AbortSignal): Promise<OrderCancellation> {
  if (!process.env.DUFFEL_API_KEY) throw new Error("DUFFEL_API_KEY is not configured");
  const quoteResponse = await guardedFetch("duffel", `${API}/air/order_cancellations`, {
    method: "POST",
    headers: HEADERS(),
    body: JSON.stringify({ data: { order_id: orderId } }),
    signal: withProviderTimeout(signal),
  });
  const quoteBody = await quoteResponse.json();
  if (!quoteResponse.ok) throw new Error(`Duffel cancellation quote failed: ${quoteResponse.status} ${JSON.stringify(quoteBody.errors ?? quoteBody)}`);
  const quote = quoteBody.data as { id: string; refund_amount?: string | null; refund_currency?: string | null };

  const confirmResponse = await guardedFetch("duffel", `${API}/air/order_cancellations/${encodeURIComponent(quote.id)}/actions/confirm`, {
    method: "POST",
    headers: HEADERS(),
    signal: withProviderTimeout(signal),
  });
  const confirmBody = await confirmResponse.json();
  if (!confirmResponse.ok) throw new Error(`Duffel cancellation confirm failed: ${confirmResponse.status} ${JSON.stringify(confirmBody.errors ?? confirmBody)}`);
  const confirmed = confirmBody.data as { confirmed_at?: string | null; refund_amount?: string | null; refund_currency?: string | null };
  return {
    status: confirmed.confirmed_at ? "cancelled" : "pending",
    refundAmount: confirmed.refund_amount ?? quote.refund_amount ?? null,
    refundCurrency: confirmed.refund_currency ?? quote.refund_currency ?? null,
  };
}
