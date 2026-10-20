import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

const stopSchema = z.object({ name: z.string().optional() }).optional();
const responseSchema = z.object({
  routes: z.array(z.object({
    distanceMeters: z.number().optional(),
    duration: z.string().optional(),
    polyline: z.object({ encodedPolyline: z.string().optional() }).optional(),
    travelAdvisory: z.object({
      transitFare: z.object({ currencyCode: z.string().optional(), units: z.union([z.string(), z.number()]).optional(), nanos: z.number().optional() }).optional(),
    }).optional(),
    legs: z.array(z.object({
      steps: z.array(z.object({
        travelMode: z.string().optional(),
        staticDuration: z.string().optional(),
        distanceMeters: z.number().optional(),
        polyline: z.object({ encodedPolyline: z.string().optional() }).optional(),
        transitDetails: z.object({
          headsign: z.string().optional(),
          stopCount: z.number().optional(),
          transitLine: z.object({
            nameShort: z.string().optional(),
            name: z.string().optional(),
            color: z.string().optional(),
            textColor: z.string().optional(),
            vehicle: z.object({ type: z.string().optional(), name: z.object({ text: z.string().optional() }).optional() }).optional(),
            agencies: z.array(z.object({ name: z.string().optional() })).optional(),
          }).optional(),
          // The clock times sit beside the stops, not inside them.
          stopDetails: z.object({ departureStop: stopSchema, arrivalStop: stopSchema, departureTime: z.string().optional(), arrivalTime: z.string().optional() }).optional(),
          localizedValues: z.object({ departureTime: z.object({ timeZone: z.string().optional() }).optional() }).optional(),
        }).optional(),
      })).default([]),
    })).default([]),
  })).default([]),
});

const seconds = (value?: string) => (value ? Number.parseFloat(value.replace("s", "")) || 0 : 0);

/** Decode a Google/OSRM encoded polyline to [lng, lat] pairs (precision 5). */
function decodePolyline(str: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    let shift = 0, result = 0, b: number;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

/** Coarse vehicle bucket from Google's transit vehicle type. */
function transitMode(vehicleType?: string, travelMode?: string): "walk" | "bus" | "subway" | "tram" | "train" | "ferry" | "transit" {
  if (travelMode === "WALK") return "walk";
  const t = (vehicleType ?? "").toUpperCase();
  if (t.includes("SUBWAY") || t.includes("METRO_RAIL")) return "subway";
  if (t.includes("TRAM") || t.includes("LIGHT_RAIL") || t.includes("CABLE_CAR") || t.includes("GONDOLA")) return "tram";
  if (t.includes("RAIL") || t.includes("TRAIN") || t.includes("HIGH_SPEED")) return "train";
  if (t.includes("FERRY") || t.includes("BOAT")) return "ferry";
  if (t.includes("BUS") || t.includes("TROLLEYBUS") || t.includes("INTERCITY_BUS")) return "bus";
  return "transit";
}

type TransitStep = {
  mode: ReturnType<typeof transitMode>;
  durationSeconds: number;
  line?: string;
  vehicleName?: string;
  agency?: string;
  color?: string;
  headsign?: string;
  stopCount?: number;
  departureStop?: string;
  arrivalStop?: string;
  polyline?: Array<[number, number]>;
};
export type TransitRoute = {
  provider: "google-routes";
  distanceMeters: number;
  durationSeconds: number;
  departureTime?: string;
  arrivalTime?: string;
  fare?: { amount: number; currency: string };
  polyline?: Array<[number, number]>;
  /** The IANA zone the journey's clock times are in (where it starts), so they can be shown as the station clocks read. */
  timeZone?: string;
  steps: TransitStep[];
};

export async function transit(
  input: { origin: [number, number] | string; destination: [number, number] | string; departureTime?: string; arrivalTime?: string; /** Plan for fewer changes or less walking: a different set of alternatives from the default. */ routingPreference?: "LESS_WALKING" | "FEWER_TRANSFERS" },
  signal?: AbortSignal,
): Promise<TransitRoute[]> {
  if (input.departureTime && input.arrivalTime) throw new Error("Transit requests cannot specify both times");
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  const place = (value: [number, number] | string) =>
    typeof value === "string" ? { address: value } : { location: { latLng: { latitude: value[1], longitude: value[0] } } };
  const response = await guardedFetch("google-places", "https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
      "x-goog-fieldmask":
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.transitFare,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.transitDetails",
    },
    body: JSON.stringify({
      origin: place(input.origin),
      destination: place(input.destination),
      travelMode: "TRANSIT",
      computeAlternativeRoutes: true,
      ...(input.routingPreference ? { transitPreferences: { routingPreference: input.routingPreference } } : {}),
      ...(input.departureTime ? { departureTime: input.departureTime } : {}),
      ...(input.arrivalTime ? { arrivalTime: input.arrivalTime } : {}),
    }),
    signal: withProviderTimeout(signal),
  });
  if (!response.ok) throw new Error(`Transit failed: ${response.status}`);
  return responseSchema.parse(await response.json()).routes.map((route) => {
    const steps = route.legs.flatMap((leg) => leg.steps);
    const transitSteps = steps.filter((step) => step.transitDetails);
    const fareUnits = route.travelAdvisory?.transitFare?.units;
    const fareAmount = fareUnits != null ? Number(fareUnits) + (route.travelAdvisory?.transitFare?.nanos ?? 0) / 1e9 : undefined;
    return {
      provider: "google-routes" as const,
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: seconds(route.duration) || steps.reduce((total, step) => total + seconds(step.staticDuration), 0),
      departureTime: transitSteps[0]?.transitDetails?.stopDetails?.departureTime,
      arrivalTime: transitSteps.at(-1)?.transitDetails?.stopDetails?.arrivalTime,
      fare: fareAmount != null && route.travelAdvisory?.transitFare?.currencyCode
        ? { amount: fareAmount, currency: route.travelAdvisory.transitFare.currencyCode }
        : undefined,
      polyline: route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : undefined,
      timeZone: transitSteps[0]?.transitDetails?.localizedValues?.departureTime?.timeZone,
      steps: steps.map((step) => {
        const td = step.transitDetails;
        const line = td?.transitLine;
        return {
          mode: transitMode(line?.vehicle?.type, step.travelMode),
          durationSeconds: seconds(step.staticDuration),
          line: line?.nameShort ?? line?.name,
          vehicleName: line?.vehicle?.name?.text,
          agency: line?.agencies?.[0]?.name,
          color: line?.color,
          headsign: td?.headsign,
          stopCount: td?.stopCount,
          departureStop: td?.stopDetails?.departureStop?.name,
          arrivalStop: td?.stopDetails?.arrivalStop?.name,
          polyline: step.polyline?.encodedPolyline ? decodePolyline(step.polyline.encodedPolyline) : undefined,
        } satisfies TransitStep;
      }),
    } satisfies TransitRoute;
  });
}
