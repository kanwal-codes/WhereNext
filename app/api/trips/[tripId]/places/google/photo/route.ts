import { NextResponse } from "next/server";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { PHOTO_WIDTHS } from "@/lib/places-ui";

const DAY = 86_400_000;

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId);
    const query = new URL(request.url).searchParams;
    const name = query.get("name") ?? "";
    // Only a fixed set of widths, so the cache and the Photo API bill stay bounded.
    const requested = Number(query.get("w"));
    const width = (PHOTO_WIDTHS as readonly number[]).includes(requested) ? requested : PHOTO_WIDTHS[0];
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
