import { NextResponse } from "next/server";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";

const DAY = 86_400_000;

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId);
    const search = new URL(request.url).searchParams;
    const name = search.get("name") ?? "";
    // A card shows ~250 px and a panel strip ~290 px; serving 800 px to both was 3× the bytes. Snapped to a few widths so the cache stays small.
    const width = Math.min(1200, Math.max(240, Math.round((Number(search.get("w")) || 800) / 80) * 80));
    if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return NextResponse.json({ error: "Invalid Google photo name" }, { status: 400 });
    // A photo resource name maps to immutable bytes, so the bytes themselves are cached
    // server-side (same pattern as the brand-icon proxy) — every viewer re-fetching the same
    // place photo was otherwise re-billing Google's Photo API for an image that never changes.
    const photo = await cached(`place-photo:${name}:${width}`, 30 * DAY, async () => {
      // Not `request.signal`: this load is shared across every caller waiting on the same
      // cache key, so one caller navigating away must not abort it for the others.
      const response = await fetch(new GooglePlacesProvider().photoUrl(name, width), { signal: AbortSignal.timeout(8000) });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) throw new Error("Place photo is unavailable");
      const buf = Buffer.from(await response.arrayBuffer());
      return { b64: buf.toString("base64"), contentType };
    });
    // The route stays authenticated (trip membership above); the response itself is still
    // only cached privately in the browser, even though the bytes are shared server-side.
    return new Response(Buffer.from(photo.b64, "base64"), {
      headers: { "content-type": photo.contentType, "cache-control": "private, max-age=604800, immutable" },
    });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Place photo is unavailable");
  }
}
