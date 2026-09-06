import { NextResponse } from "next/server";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId);
    const name = new URL(request.url).searchParams.get("name") ?? "";
    if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return NextResponse.json({ error: "Invalid Google photo name" }, { status: 400 });
    const response = await fetch(new GooglePlacesProvider().photoUrl(name), { signal: request.signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) return NextResponse.json({ error: "Place photo is unavailable" }, { status: 503 });
    // A photo resource name maps to immutable bytes; the route is authenticated, so keep it private.
    return new Response(response.body, { headers: { "content-type": contentType, "cache-control": "private, max-age=604800, immutable" } });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place photo is unavailable");
  }
}
