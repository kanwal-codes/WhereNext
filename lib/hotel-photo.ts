/**
 * Hotel photographs come from a dozen hosts: Google's image servers for the thumbnails, and for the full-size gallery
 * whatever the hotel or the listing site uses (Vrbo, Expedia, Hotelbeds, a property manager's own bucket). Browsers load
 * them unreliably straight from the page — Chromium's opaque-response blocking refuses a good share, and many hosts turn
 * away a request that carries our page as its referrer — and the card shows a blank box. So they are fetched by our own
 * server (`/api/hotel-photo`), which sends no referrer, and served from the app's own origin.
 */
const GOOGLE_IMAGE_HOST = /^(?:lh\d+\.googleusercontent\.com|(?:encrypted-)?tbn\d*\.gstatic\.com|www\.gstatic\.com|[a-z0-9-]+\.ggpht\.com|streetviewpixels-pa\.googleapis\.com)$/i;

export const isGoogleImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GOOGLE_IMAGE_HOST.test(url.hostname);
  } catch {
    return false;
  }
};

const PROXY_PATH = "/api/hotel-photo";

/** Google's image hosts only: for generic images (events, places) whose other hosts load fine on their own. */
export function googlePhotoSrc<T extends string | null | undefined>(src: T): T | string {
  return typeof src === "string" && isGoogleImageUrl(src) ? `${PROXY_PATH}?u=${encodeURIComponent(src)}` : src;
}

/** The URL a hotel photograph should be loaded from: any web address goes through our server; ours, relative ones and inline data stay as they are. */
export function hotelPhotoSrc<T extends string | null | undefined>(src: T): T | string {
  return typeof src === "string" && /^https:\/\//i.test(src) ? `${PROXY_PATH}?u=${encodeURIComponent(src)}` : src;
}
