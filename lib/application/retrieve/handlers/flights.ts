import { searchFlightOffers } from "@/lib/server/flight-search";
import { serpConfigured } from "@/packages/providers/serpapi/client";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";

type FlightsCall = Extract<ToolCall, { tool: "flights" }>;

export async function handleFlights(call: FlightsCall, ctx: RetrieveContext): Promise<void> {
  if (!serpConfigured() && !process.env.DUFFEL_API_KEY) return;
  // The model routinely emits a stale year; never trust it. Anything not clearly
  // in the future becomes an example date ~6 weeks out.
  const today = new Date().toISOString().slice(0, 10);
  const assumedDate = !call.departureDate || call.departureDate <= today;
  const departureDate = assumedDate ? new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10) : call.departureDate!;
  const returnDate = call.returnDate && call.returnDate > departureDate ? call.returnDate : undefined;
  // Real Google Flights fares in the trip's currency when SerpAPI is set up, else the Duffel stand-in converted to it.
  const found = await searchFlightOffers({ origin: call.origin, destination: call.destination, departureDate, returnDate, currency: ctx.filters.currency ?? "CAD", country: ctx.filters.country }, ctx.signal).catch(ctx.fail("flights"));
  if (found && found.offers.length) {
    ctx.flights.push({
      origin: found.from?.label ?? call.origin,
      destination: found.to?.label ?? call.destination,
      departureDate,
      returnDate,
      assumedDate,
      offers: found.offers.slice(0, 10),
      originId: found.from?.id,
      destinationId: found.to?.id,
      insights: found.insights,
      provider: found.provider,
    });
  }
}
