import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { snapPhotoWidth } from "@/lib/places-ui";

const PHOTO_NAME = /^places\/([A-Za-z0-9_-]+)\/photos\/[A-Za-z0-9_-]+$/;

/** The photograph to show in place of a retired one: the first wide landscape frame the place has now, else its first photograph. */
function bestPhoto(photos: Array<{ name: string; widthPx?: number; heightPx?: number }>): string | null {
  const landscape = photos.find((p) => p.widthPx && p.heightPx && p.widthPx / p.heightPx >= 1.3 && p.widthPx >= 1000);
  return (landscape ?? photos[0])?.name ?? null;
}

/**
 * The bytes of one Google place photo for a signed-in viewer, as a Response. Shared by the
 * trip-scoped proxy and the account-level one: the caller has already checked who is asking.
 * Widths are snapped (see `snapPhotoWidth`), so the number of distinct images (and Google's Photo API bill) stays bounded.
 *
 * Google retires photo names after a while, and ours are saved on trips, in saved places and inside old chat cards for months. A retired
 * name is not a lost picture: the place id is in the name (`places/{id}/photos/…`), so this asks Google for that place's current photos
 * and serves one of those instead, for a day. `heal=0` turns that off for a caller that would rather re-pick the picture itself (the
 * trip cover, which searches for a scenic photograph and saves its name).
 */
export async function placePhotoResponse(query: URLSearchParams): Promise<Response> {
  const name = query.get("name") ?? "";
  const width = snapPhotoWidth(query.get("w"));
  const match = PHOTO_NAME.exec(name);
  if (!match) return Response.json({ error: "Invalid Google photo name" }, { status: 400 });
  const provider = new GooglePlacesProvider();
  // A photo resource name maps to immutable bytes. They are NOT kept in the shared Redis cache: a
  // single photo is hundreds of KB to 1.6 MB, and 30 days of them filled the whole database, after
  // which every Redis write (rate limits included) failed. The browser caches them for a week
  // instead (see the header below), which keeps Google's Photo API bill bounded per viewer.
  const fetchPhoto = (photoName: string) => fetch(provider.photoUrl(photoName, width), { signal: AbortSignal.timeout(8000) });
  let response = await fetchPhoto(name);
  let healed = false;
  // 400/404 mean Google no longer knows this name: a missing picture, not a server fault. A refused key (403), a quota hit (429) or an
  // outage still throw below, where they stay loud.
  if ((response.status === 400 || response.status === 404) && query.get("heal") !== "0") {
    const fresh = await provider.photos(match[1]!).then(bestPhoto, () => null);
    if (fresh && fresh !== name) {
      const retry = await fetchPhoto(fresh);
      if (retry.ok) {
        response = retry;
        healed = true;
      }
    }
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 400 || response.status === 404) return Response.json({ error: "Photo not found" }, { status: 404 });
  if (!response.ok || !response.body || !contentType.toLowerCase().startsWith("image/")) {
    // Google's own reason (key restriction, quota, an expired photo name) is the only way to tell these apart in the logs.
    const detail = response.ok ? contentType : (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`Place photo is unavailable (Google ${response.status}: ${detail})`);
  }
  return new Response(await response.arrayBuffer(), {
    // A replacement is only good for as long as Google keeps it, and the saved name still points at the retired one: a day, not a week.
    headers: { "content-type": contentType, "cache-control": healed ? "private, max-age=86400" : "private, max-age=604800, immutable" },
  });
}
