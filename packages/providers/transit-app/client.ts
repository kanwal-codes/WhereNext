import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

const legSchema = z.object({
  leg_mode: z.string().optional(),
  duration: z.number().optional(),
  distance: z.number().optional(),
  start_time: z.number().optional(),
  end_time: z.number().optional(),
  routes: z.array(z.object({
    route_short_name: z.string().optional(),
    route_long_name: z.string().optional(),
  })).optional(),
});
const responseSchema = z.object({
  results: z.array(z.object({
    duration: z.number().optional(),
    start_time: z.number().optional(),
    end_time: z.number().optional(),
    fare: z.union([z.number(), z.string()]).nullable().optional(),
    legs: z.array(legSchema).default([]),
  })).default([]),
});

export type TransitAppRoute = {
  provider: "transit-app";
  distanceMeters: number;
  durationSeconds: number;
  departureTime?: string;
  arrivalTime?: string;
  steps: Array<{ mode: string; durationSeconds: number; line?: string }>;
};

/** Local transit trip plan from Transit App. `from`/`to` are [longitude, latitude]. Null if uncovered or no plan. */
export async function transitAppPlan(from: [number, number], to: [number, number], signal?: AbortSignal): Promise<TransitAppRoute | null> {
  const key = process.env.TRANSIT_API_KEY;
  if (!key) throw new Error("TRANSIT_API_KEY is not configured");
  const url = new URL("https://external.transitapp.com/v3/public/plan");
  url.searchParams.set("from_lat", String(from[1]));
  url.searchParams.set("from_lon", String(from[0]));
  url.searchParams.set("to_lat", String(to[1]));
  url.searchParams.set("to_lon", String(to[0]));
  const response = await guardedFetch("transit-app", url, { headers: { apiKey: key }, signal: withProviderTimeout(signal) });
  if (!response.ok) throw new Error(`Transit App plan failed: ${response.status}`);
  const itinerary = responseSchema.parse(await response.json()).results[0];
  if (!itinerary || !itinerary.duration) return null;
  const iso = (unix?: number) => (unix ? new Date(unix * 1000).toISOString() : undefined);
  return {
    provider: "transit-app",
    distanceMeters: itinerary.legs.reduce((total, leg) => total + (leg.distance ?? 0), 0),
    durationSeconds: itinerary.duration,
    departureTime: iso(itinerary.start_time),
    arrivalTime: iso(itinerary.end_time),
    steps: itinerary.legs.map((leg) => ({
      mode: (leg.leg_mode ?? "transit").toUpperCase(),
      durationSeconds: leg.duration ?? 0,
      line: leg.routes?.[0]?.route_short_name ?? leg.routes?.[0]?.route_long_name,
    })),
  };
}
