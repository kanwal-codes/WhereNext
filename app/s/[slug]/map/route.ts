import { NextResponse } from "next/server";
import { staticMapUrl } from "@/packages/providers/mapbox/client";
import { loadPublicTrip } from "@/lib/server/public-trip";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { clientKey } from "@/lib/server/guest";

/** Public static-map proxy for a shared trip. Keeps the Mapbox token server-side. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Unauthenticated and every miss is a metered Mapbox Static Images call on the operator's token.
  if (!(await withinRateLimit(`public-map:${clientKey(request)}`, 120, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const trip = await loadPublicTrip((await params).slug);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!process.env.MAPBOX_ACCESS_TOKEN) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const markers = [...trip.itinerary, ...trip.places]
    .filter((x): x is typeof x & { latitude: number; longitude: number } => typeof x.latitude === "number" && typeof x.longitude === "number")
    .slice(0, 15)
    .map((x) => [x.longitude, x.latitude] as [number, number]);
  if (markers.length === 0) return NextResponse.json({ error: "no points" }, { status: 404 });

  const response = await fetch(staticMapUrl(markers, { width: 640, height: 360 }), { signal: request.signal });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return new Response(response.body, { headers: { "content-type": contentType, "cache-control": "public, max-age=3600, s-maxage=600, stale-while-revalidate=600" } });
}
