import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { cached } from "@/lib/server/ttl-cache";
import { snapPhotoWidth } from "@/lib/places-ui";

const DAY = 86_400_000;

/**
 * The bytes of one Google place photo for a signed-in viewer, as a Response. Shared by the
 * trip-scoped proxy and the account-level one: the caller has already checked who is asking.
 * Widths are snapped (see `snapPhotoWidth`), so the cache and Google's Photo API bill stay bounded.
 */
export async function placePhotoResponse(query: URLSearchParams): Promise<Response> {
  const name = query.get("name") ?? "";
  const width = snapPhotoWidth(query.get("w"));
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return Response.json({ error: "Invalid Google photo name" }, { status: 400 });
  // A photo resource name maps to immutable bytes, so the bytes are cached server-side for every viewer.
  // Not tied to the caller's abort signal: the load is shared across everyone waiting on the same key.
  const photo = await cached(`place-photo:${name}:${width}`, 30 * DAY, async () => {
    const response = await fetch(new GooglePlacesProvider().photoUrl(name, width), { signal: AbortSignal.timeout(8000) });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) throw new Error("Place photo is unavailable");
    const buf = Buffer.from(await response.arrayBuffer());
    return { b64: buf.toString("base64"), contentType };
  });
  return new Response(Buffer.from(photo.b64, "base64"), {
    headers: { "content-type": photo.contentType, "cache-control": "private, max-age=604800, immutable" },
  });
}
