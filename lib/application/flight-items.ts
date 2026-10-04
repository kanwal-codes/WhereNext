import type { FlightOffer } from "@/packages/providers/duffel/client";
import type { AssistantBlock } from "@/packages/contracts/assistant";

export type FlightItem = Extract<AssistantBlock, { type: "flights" }>["items"][number];

/** A provider offer as the flights card holds it: the card contract's field limits applied. Shared by the chat turn and the card's own date search. */
export function toFlightItem(offer: FlightOffer): FlightItem {
  return {
    id: offer.id?.slice(0, 240),
    airline: offer.airline.slice(0, 80),
    operatingAirline: offer.operatingAirline?.slice(0, 80),
    price: offer.priceAmount.slice(0, 20),
    currency: offer.priceCurrency.slice(0, 8),
    listedPrice: offer.listedAmount?.slice(0, 20),
    listedCurrency: offer.listedCurrency?.slice(0, 8),
    durationMinutes: offer.durationMinutes,
    stops: offer.stops,
    departAt: offer.departAt.slice(0, 40),
    arriveAt: offer.arriveAt.slice(0, 40),
    originAirport: offer.originAirport?.slice(0, 8),
    destinationAirport: offer.destinationAirport?.slice(0, 8),
    cabinClass: offer.cabinClass?.slice(0, 40),
    baggage: offer.baggage?.slice(0, 120),
    layoverAirports: offer.layoverAirports?.slice(0, 6),
    aircraft: offer.aircraft?.slice(0, 120),
    fareConditions: offer.fareConditions?.slice(0, 4),
    expiresAt: offer.expiresAt?.slice(0, 40),
    logo: offer.logo?.slice(0, 300),
    flightNumbers: offer.flightNumbers?.slice(0, 8).map((n) => n.slice(0, 16)),
    co2Kg: offer.co2Kg,
    co2Diff: offer.co2Diff,
    departureToken: offer.departureToken?.slice(0, 700),
    legs: offer.legs?.slice(0, 6).map((l) => ({
      from: l.from.slice(0, 8), fromName: l.fromName?.slice(0, 80), departAt: l.departAt.slice(0, 40),
      to: l.to.slice(0, 8), toName: l.toName?.slice(0, 80), arriveAt: l.arriveAt.slice(0, 40),
      minutes: Math.max(0, Math.round(l.minutes)), airline: l.airline?.slice(0, 60), flightNumber: l.flightNumber?.slice(0, 16), aircraft: l.aircraft?.slice(0, 60),
      logo: l.logo?.slice(0, 300), legroom: l.legroom?.slice(0, 20), amenities: l.amenities?.slice(0, 4).map((a) => a.slice(0, 60)), oftenDelayed: l.oftenDelayed,
      layoverMinutes: l.layoverMinutes === undefined ? undefined : Math.max(0, Math.round(l.layoverMinutes)), overnight: l.overnight,
    })),
  };
}
