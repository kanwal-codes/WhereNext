import { NextResponse } from "next/server";
import { staticMapUrl } from "@/packages/providers/mapbox/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";

/** Parse `?markers=lng,lat|lng,lat` into validated [lng,lat] pairs. */
function parseMarkers(raw: string): Array<[number, number]> {
  return raw
    .split("|")
    .map((pair) => pair.split(",").map(Number))
    .filter((p): p is [number, number] => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    await requireTripMember((await params).tripId);
    if (!process.env.MAPBOX_ACCESS_TOKEN) return NextResponse.json({ error: "Map imagery is not configured" }, { status: 503 });
    const search = new URL(request.url).searchParams;
    const markers = parseMarkers(search.get("markers") ?? "");
    const width = Number(search.get("w")) || 640;
    const height = Number(search.get("h")) || 420;
    const response = await fetch(staticMapUrl(markers, { width, height }), { signal: request.signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Map image is unavailable" }, { status: 503 });
    }
    return new Response(response.body, { headers: { "content-type": contentType, "cache-control": "private, max-age=300" } });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Map image is unavailable" }, { status: 503 });
  }
}
