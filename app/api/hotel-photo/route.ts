import { isGoogleImageUrl } from "@/lib/hotel-photo";
import { readBytesCapped, safeFetch, UnsafeUrlError } from "@/lib/server/safe-fetch";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/server/logger";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { clientKey } from "@/lib/server/guest";

const MAX_BYTES = 6 * 1024 * 1024;
const ACCEPT = { accept: "image/avif,image/webp,image/*", "user-agent": "Mozilla/5.0 (compatible; WhereNext/1.0)" };

const unavailable = (reason: string, host: string, extra?: Record<string, unknown>) => {
  // A photo that cannot be fetched used to vanish without a trace; the host and the reason are what a missing picture needs.
  logger.warn({ host, reason, ...extra }, "hotel photo unavailable");
  return new Response("Photo unavailable", { status: 502 });
};

/**
 * A hotel photograph, fetched here and served from our own origin (see lib/hotel-photo.ts).
 * Google's image hosts are fetched directly. Any other host is fetched through the SSRF-guarded fetch
 * (https only, public addresses only, redirects re-checked) and only for a signed-in visitor (guests included),
 * so this is never an open proxy.
 */
/** Follows redirects by hand so every hop is re-checked against the Google image-host allow-list
 *  (a plain `redirect: "follow"` would happily chase a Google host's redirect to anywhere). */
async function fetchGoogleImage(url: string, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, { signal, headers: ACCEPT, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    const next = new URL(location, current).toString();
    if (!isGoogleImageUrl(next)) throw new UnsafeUrlError("redirect left the Google image hosts");
    current = next;
  }
  throw new UnsafeUrlError("too many redirects");
}

export async function GET(request: Request) {
  // Unauthenticated for Google image hosts, so bound it per client: every request is one upstream
  // fetch and up to 6 MiB through a function. Fails open (availability over strict enforcement).
  if (!(await withinRateLimit(`hotel-photo:${clientKey(request)}`, 1200, 60 * 60_000))) {
    return new Response("Too many photo requests", { status: 429 });
  }
  const target = new URL(request.url).searchParams.get("u") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Not an image address", { status: 400 });
  }
  if (parsed.protocol !== "https:") return new Response("Not an image address", { status: 400 });
  const host = parsed.hostname;
  const google = isGoogleImageUrl(target);

  if (!google) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return new Response("Sign in to see photos", { status: 401 });
  }

  // Google's "original" size (=s10000) can be many megabytes; nothing here is shown wider than a screen.
  const sized = google ? target.replace(/=s(\d{4,})$/, "=s1600") : target;
  try {
    const upstream = google
      ? await fetchGoogleImage(sized, AbortSignal.timeout(10_000))
      : await safeFetch(sized, { signal: request.signal, headers: ACCEPT });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) return unavailable(`upstream ${upstream.status} ${type.split(";")[0]}`, host);
    const bytes = await readBytesCapped(upstream, MAX_BYTES);
    if (!bytes) return unavailable("too large", host);
    return new Response(bytes, { headers: { "content-type": type, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
  } catch (error) {
    if (error instanceof UnsafeUrlError) return new Response("Not an image we serve", { status: 400 });
    return unavailable(error instanceof Error ? error.message : "fetch failed", host);
  }
}
