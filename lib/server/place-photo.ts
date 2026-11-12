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
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) return Response.json({ error: "Invalid Google photo name" }, { status: 400 });
  // A photo resource name maps to immutable bytes. They are NOT kept in the shared Redis cache: a
  // single photo is hundreds of KB to 1.6 MB, and 30 days of them filled the whole database, after
  // which every Redis write (rate limits included) failed. The browser caches them for a week
  // instead (see the header below), which keeps Google's Photo API bill bounded per viewer.
  const response = await fetch(new GooglePlacesProvider().photoUrl(name, width), { signal: AbortSignal.timeout(8000) });
  const contentType = response.headers.get("content-type") ?? "";
  // A photo name Google no longer knows (they expire, and ours are saved on trips for months) is a missing picture, not a server fault: 404, so
  // it is not counted as a 5xx. A refused key (403), a quota hit (429) or an outage still throw below, where they stay loud.
  if (response.status === 400 || response.status === 404) return Response.json({ error: "Photo not found" }, { status: 404 });
  if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) {
    // Google's own reason (key restriction, quota, an expired photo name) is the only way to tell these apart in the logs.
    const detail = response.ok ? contentType : (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`Place photo is unavailable (Google ${response.status}: ${detail})`);
  }
  return new Response(await response.arrayBuffer(), {
    headers: { "content-type": contentType, "cache-control": "private, max-age=604800, immutable" },
  });
}
