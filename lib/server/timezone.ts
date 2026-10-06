import { cached } from "@/lib/server/ttl-cache";
import { guardedFetch } from "@/lib/server/provider-guard";
import { withProviderTimeout } from "@/packages/providers/request-signal";

const DAY_MS = 24 * 60 * 60_000;

/** A place's offset from UTC (seconds, daylight saving included) at a moment, from Google's Time Zone API. */
async function offsetAt(lng: number, lat: number, atSeconds: number, signal?: AbortSignal): Promise<number> {
  const key = `tz:${lat.toFixed(1)},${lng.toFixed(1)}:${Math.floor(atSeconds / 86400)}`;
  return cached(key, DAY_MS, async () => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
    const url = new URL("https://maps.googleapis.com/maps/api/timezone/json");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("timestamp", String(Math.floor(atSeconds)));
    url.searchParams.set("key", apiKey);
    const res = await guardedFetch("google-places", url, { signal: withProviderTimeout(signal, 5_000) });
    const body = (await res.json()) as { status?: string; rawOffset?: number; dstOffset?: number };
    if (!res.ok || body.status !== "OK" || typeof body.rawOffset !== "number") throw new Error(`time zone lookup failed: ${body.status ?? res.status}`);
    return body.rawOffset + (body.dstOffset ?? 0);
  });
}

/**
 * A wall-clock time at a place ("2026-10-06" and "09:00" in London) as the moment it is, in UTC. The offset is read at the
 * moment itself (a second pass), so a time just after the clocks change is right. `null` when the lookup fails.
 */
export async function localToUtc(date: string, time: string, [lng, lat]: [number, number], signal?: AbortSignal): Promise<string | null> {
  const asIfUtc = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(asIfUtc)) return null;
  try {
    const first = await offsetAt(lng, lat, asIfUtc / 1000, signal);
    const second = await offsetAt(lng, lat, (asIfUtc - first * 1000) / 1000, signal);
    return new Date(asIfUtc - second * 1000).toISOString();
  } catch {
    return null;
  }
}
