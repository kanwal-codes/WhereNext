import { z } from "zod";
import { withProviderTimeout } from "../request-signal";

const stopSchema = z.object({ name: z.string().optional(), departureTime: z.string().optional(), arrivalTime: z.string().optional() }).optional();
const responseSchema = z.object({
  routes: z.array(z.object({
    distanceMeters: z.number().optional(),
    duration: z.string().optional(),
    legs: z.array(z.object({
      steps: z.array(z.object({
        travelMode: z.string().optional(),
        staticDuration: z.string().optional(),
        transitDetails: z.object({
          headsign: z.string().optional(),
          transitLine: z.object({ nameShort: z.string().optional(), name: z.string().optional() }).optional(),
          stopDetails: z.object({ departureStop: stopSchema, arrivalStop: stopSchema }).optional(),
        }).optional(),
      })).default([]),
    })).default([]),
  })).default([]),
});

const seconds = (value?: string) => (value ? Number.parseFloat(value.replace("s", "")) || 0 : 0);

export async function transit(
  input: { origin: [number, number] | string; destination: [number, number] | string; departureTime?: string; arrivalTime?: string },
  signal?: AbortSignal,
) {
  if (input.departureTime && input.arrivalTime) throw new Error("Transit requests cannot specify both times");
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  const place = (value: [number, number] | string) =>
    typeof value === "string" ? { address: value } : { location: { latLng: { latitude: value[1], longitude: value[0] } } };
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
      "x-goog-fieldmask": "routes.distanceMeters,routes.duration,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails",
    },
    body: JSON.stringify({
      origin: place(input.origin),
      destination: place(input.destination),
      travelMode: "TRANSIT",
      computeAlternativeRoutes: true,
      ...(input.departureTime ? { departureTime: input.departureTime } : {}),
      ...(input.arrivalTime ? { arrivalTime: input.arrivalTime } : {}),
    }),
    signal: withProviderTimeout(signal),
  });
  if (!response.ok) throw new Error(`Transit failed: ${response.status}`);
  return responseSchema.parse(await response.json()).routes.map((route) => {
    const steps = route.legs.flatMap((leg) => leg.steps);
    const transitSteps = steps.filter((step) => step.transitDetails);
    return {
      provider: "google-routes",
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: seconds(route.duration) || steps.reduce((total, step) => total + seconds(step.staticDuration), 0),
      departureTime: transitSteps[0]?.transitDetails?.stopDetails?.departureStop?.departureTime,
      arrivalTime: transitSteps.at(-1)?.transitDetails?.stopDetails?.arrivalStop?.arrivalTime,
      steps: steps.map((step) => ({
        mode: step.travelMode ?? "TRANSIT",
        durationSeconds: seconds(step.staticDuration),
        line: step.transitDetails?.transitLine?.nameShort ?? step.transitDetails?.transitLine?.name,
        headsign: step.transitDetails?.headsign,
        departureStop: step.transitDetails?.stopDetails?.departureStop?.name,
        arrivalStop: step.transitDetails?.stopDetails?.arrivalStop?.name,
      })),
    };
  });
}
