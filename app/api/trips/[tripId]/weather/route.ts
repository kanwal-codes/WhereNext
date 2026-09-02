import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { weather } from "@/packages/providers/openweather/client";
import { cached } from "@/lib/server/ttl-cache";

/** Current conditions + near-term outlook for a place (OpenWeather). */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId);
    if (!process.env.OPENWEATHER_API_KEY) return NextResponse.json({ error: "Weather is not configured" }, { status: 503 });
    const location = (new URL(request.url).searchParams.get("location") ?? "").trim();
    if (!location) return NextResponse.json({ error: "A location is required" }, { status: 400 });

    const result = await cached(`weather:${location.toLowerCase()}`, 30 * 60_000, async () => {
      const hits = await new GooglePlacesProvider().search(location, request.signal);
      const anchor = hits[0];
      if (!anchor) throw new Error("no anchor");
      const forecast = await weather({ latitude: anchor.latitude, longitude: anchor.longitude, name: anchor.name }, request.signal);
      return { location: forecast.location, summary: forecast.summary, retrievedAt: forecast.retrievedAt };
    });

    return NextResponse.json({ ...result, freshness: { provider: "openweather", retrievedAt: result.retrievedAt, cacheTtlSeconds: 1800 } });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Weather is unavailable right now" }, { status: 503 });
  }
}
