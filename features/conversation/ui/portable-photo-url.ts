// Same shape enforced by the server photo proxy: /api/trips/<uuid>/places/google/photo?name=...
const PROXY_PHOTO_URL = /^(?:https?:\/\/[^/\s]+)?\/api\/trips\/[0-9a-f-]{36}\/places\/google\/photo\?name=.+/i;

export function isProxyPhotoUrl(src: unknown): src is string {
  return typeof src === "string" && PROXY_PHOTO_URL.test(src);
}

/** Makes old persisted localhost/preview photo URLs portable to the device viewing them now. */
export function portableProxyPhotoUrl(src: unknown): string | null {
  if (!isProxyPhotoUrl(src)) return null;
  if (src.startsWith("/")) return src;
  try {
    const url = new URL(src);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
