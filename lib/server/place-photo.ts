import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { snapPhotoWidth } from "@/lib/places-ui";

/**
 * The bytes of one Google place photo for a signed-in viewer, as a Response. Shared by the
 * trip-scoped proxy and the account-level one: the caller has already checked who is asking.
 * Widths are snapped (see `snapPhotoWidth`), so the number of distinct images (and Google's Photo API bill) stays bounded.
 */
export async function placePhotoResponse(query: URLSearchParams): Promise<Response> {
  const name = query.get("name") ?? "";
  const width = snapPhotoWidth(query.get("w"));
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return Response.json({ error: "Invalid Google photo name" }, { status: 400 });
  // A photo resource name maps to immutable bytes. They are NOT kept in the shared Redis cache: a
  // single photo is hundreds of KB to 1.6 MB, and 30 days of them filled the whole database, after
  // which every Redis write (rate limits included) failed. The browser caches them for a week
  // instead (see the header below), which keeps Google's Photo API bill bounded per viewer.
  const response = await fetch(new GooglePlacesProvider().photoUrl(name, width), { signal: AbortSignal.timeout(8000) });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) throw new Error("Place photo is unavailable");
  return new Response(await response.arrayBuffer(), {
    headers: { "content-type": contentType, "cache-control": "private, max-age=604800, immutable" },
  });
}
