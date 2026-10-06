import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
const schema = z.object({ routes: z.array(z.object({ distance: z.number(), duration: z.number(), geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number(), z.number()])) }), legs: z.array(z.object({ annotation: z.object({ congestion: z.array(z.string()).optional() }).optional() })).optional() })).min(1) });
export async function route(input: { origin: [number, number]; destination: [number, number]; profile?: "driving" | "walking" | "cycling"; /** Driving only: ask for live traffic (and its per-stretch congestion) instead of typical speeds. */ traffic?: boolean; /** Driving with traffic only: leave at this local time at the start ("2026-10-06T09:00"). */ departAt?: string }, signal?: AbortSignal) { const token = process.env.MAPBOX_ACCESS_TOKEN; if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not configured"); const profile = input.traffic && input.profile === "driving" ? "driving-traffic" : input.profile ?? "walking"; const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${input.origin.join(",")};${input.destination.join(",")}`); url.searchParams.set("access_token", token); url.searchParams.set("overview", "full"); url.searchParams.set("geometries", "geojson"); if (profile === "driving-traffic") url.searchParams.set("annotations", "congestion"); if (profile === "driving-traffic" && input.departAt) url.searchParams.set("depart_at", input.departAt); const response = await guardedFetch("mapbox", url, { signal: withProviderTimeout(signal) }); if (!response.ok) throw new Error(`Mapbox directions failed: ${response.status}`); const value = schema.parse(await response.json()).routes[0]; return { provider: "mapbox", distanceMeters: value.distance, durationSeconds: value.duration, geometry: value.geometry, congestion: value.legs?.flatMap((l) => l.annotation?.congestion ?? []) }; }

/** Mapbox Static Images API URL: numbered pins auto-fitted, retina PNG. */
export function staticMapUrl(points: Array<[number, number]>, size: { width: number; height: number }) {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  const pins = points.slice(0, 15).map(([lng, lat], i) => `pin-s-${i + 1}+2c7a5a(${lng.toFixed(5)},${lat.toFixed(5)})`).join(",");
  const overlay = pins || "";
  const viewport = pins ? "auto" : "0,20,1";
  const w = Math.min(1280, Math.max(120, Math.round(size.width)));
  const h = Math.min(1280, Math.max(120, Math.round(size.height)));
  // `padding` is only accepted with the `auto` viewport — pairing it with an
  // explicit lon,lat,zoom centre makes Mapbox 422 (the empty-markers case).
  const padding = viewport === "auto" ? "&padding=48" : "";
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlay ? `${overlay}/` : ""}${viewport}/${w}x${h}@2x?access_token=${token}${padding}`;
}
