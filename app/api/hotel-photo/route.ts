import { isGoogleImageUrl } from "@/lib/hotel-photo";

const MAX_BYTES = 6 * 1024 * 1024;

/** A Google Hotels photograph, fetched here and served from our own origin (see lib/hotel-photo.ts). Google's image hosts only. */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("u") ?? "";
  if (!isGoogleImageUrl(target)) return new Response("Not an image we serve", { status: 400 });
  // Google's "original" size (=s10000) can be many megabytes; nothing here is shown wider than a screen.
  const sized = target.replace(/=s(\d{4,})$/, "=s1600");
  try {
    const upstream = await fetch(sized, { signal: AbortSignal.timeout(10_000), headers: { accept: "image/avif,image/webp,image/*" }, redirect: "error" });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) return new Response("Photo unavailable", { status: 502 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new Response("Photo too large", { status: 502 });
    return new Response(bytes, { headers: { "content-type": type, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("Photo unavailable", { status: 502 });
  }
}
