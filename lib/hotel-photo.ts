/**
 * Hotel photographs from Google Hotels live on Google's image hosts. Browsers load them unreliably straight from
 * the page (Chromium's opaque-response blocking refuses a good share of them, and the card shows its stand-in), so
 * they are fetched by our own server (`/api/hotel-photo`) and served from the app's own origin. Only Google's image
 * hosts are ever rewritten: any other URL, and our own proxied ones, pass through untouched.
 */
const GOOGLE_IMAGE_HOST = /^(?:lh\d+\.googleusercontent\.com|(?:encrypted-)?tbn\d*\.gstatic\.com|[a-z0-9-]+\.ggpht\.com|streetviewpixels-pa\.googleapis\.com)$/i;

export const isGoogleImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GOOGLE_IMAGE_HOST.test(url.hostname);
  } catch {
    return false;
  }
};

/** The URL a hotel photograph should be loaded from. */
export function hotelPhotoSrc<T extends string | null | undefined>(src: T): T | string {
  return typeof src === "string" && isGoogleImageUrl(src) ? `/api/hotel-photo?u=${encodeURIComponent(src)}` : src;
}
