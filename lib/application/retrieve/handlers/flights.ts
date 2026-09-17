import { searchFlights } from "@/packages/providers/duffel/client";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";

type FlightsCall = Extract<ToolCall, { tool: "flights" }>;

export async function handleFlights(call: FlightsCall, ctx: RetrieveContext): Promise<void> {
  if (!process.env.DUFFEL_API_KEY) return;
  // The model routinely emits a stale year; never trust it. Anything not clearly
  // in the future becomes an example date ~6 weeks out.
  const today = new Date().toISOString().slice(0, 10);
  const assumedDate = !call.departureDate || call.departureDate <= today;
  const departureDate = assumedDate ? new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10) : call.departureDate!;
  const returnDate = call.returnDate && call.returnDate > departureDate ? call.returnDate : undefined;
  const offers = await searchFlights({ origin: call.origin, destination: call.destination, departureDate, returnDate }, ctx.signal).catch(ctx.fail("duffel"));
  if (offers && offers.length) ctx.flights.push({ origin: call.origin, destination: call.destination, departureDate, assumedDate, offers: offers.slice(0, 6) });
}
