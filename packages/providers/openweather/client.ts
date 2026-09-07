import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import { cached } from "@/lib/server/ttl-cache";

export type WeatherDay = { label: string; min: number; max: number; condition: string; wet: boolean };
export type WeatherResult = { location: string; summary: string; days: WeatherDay[]; retrievedAt: string };

type GeoHit = { name?: string; lat?: number; lon?: number };
type ForecastResponse = {
  city?: { name?: string; timezone?: number };
  list?: Array<{ dt: number; main?: { temp?: number; temp_min?: number; temp_max?: number }; weather?: Array<{ main?: string; description?: string }>; rain?: unknown; snow?: unknown }>;
};

const WET = new Set(["Rain", "Drizzle", "Thunderstorm", "Snow"]);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function apiKey(): string {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error("OPENWEATHER_API_KEY is not configured");
  return key;
}

/**
 * Free `/geo/1.0/direct` lookup, cached a day. Same key and same circuit breaker as the
 * forecast, so a weather reading no longer depends on Google Places (whose breaker trips on
 * unrelated traffic and used to take weather down with it). A throw here is not cached.
 */
async function geocode(place: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string }> {
  return cached(`openweather:geo:${place.trim().toLowerCase()}`, 24 * 60 * 60_000, async () => {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(place)}&limit=1&appid=${apiKey()}`;
    const res = await guardedFetch("openweather", url, { signal: withProviderTimeout(signal) });
    if (!res.ok) throw new Error(`OpenWeather geocoding failed: ${res.status}`);
    const hit = ((await res.json()) as GeoHit[])[0];
    if (typeof hit?.lat !== "number" || typeof hit?.lon !== "number") throw new Error(`OpenWeather could not locate "${place}"`);
    return { lat: hit.lat, lon: hit.lon, name: hit.name ?? place };
  });
}

/**
 * Current conditions + a ~5-day outlook for a place name. One geocoding call and one
 * `/forecast` call, both on the free 2.5/geo endpoints (One Call 3.0 needs a paid plan).
 * The "now" line is read from the nearest forecast slot rather than a separate `/weather`
 * call — halves the quota spend and removes the partial-response case where one endpoint
 * answered and the other 401'd.
 */
export async function weather(place: string, signal?: AbortSignal): Promise<WeatherResult> {
  const { lat, lon, name } = await geocode(place, signal);
  // Cache the raw forecast 30 min, keyed on the rounded point — the API route, the AI retrieve
  // path and Nearby all reach the same entry instead of each spending a quota call per view.
  const fc = await cached(
    `openweather:fc:${lat.toFixed(2)},${lon.toFixed(2)}`,
    30 * 60_000,
    async () => {
      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey()}`;
      const res = await guardedFetch("openweather", url, { signal: withProviderTimeout(signal) });
      if (!res.ok) throw new Error(`OpenWeather forecast failed: ${res.status}`);
      return (await res.json()) as ForecastResponse;
    },
  );

  const slots = fc.list ?? [];
  if (slots.length === 0) throw new Error("OpenWeather returned no forecast slots");

  // Bucket the 3-hour slots into local calendar days.
  const tz = fc.city?.timezone ?? 0;
  const buckets = new Map<string, { order: number; dow: number; min: number; max: number; conditions: string[]; wet: boolean }>();
  for (const slot of slots) {
    const local = new Date((slot.dt + tz) * 1000);
    const dayKey = local.toISOString().slice(0, 10);
    const t = slot.main?.temp;
    const lo = slot.main?.temp_min ?? t;
    const hi = slot.main?.temp_max ?? t;
    const main = slot.weather?.[0]?.main ?? "";
    const wet = WET.has(main) || slot.rain != null || slot.snow != null;
    const b = buckets.get(dayKey) ?? { order: buckets.size, dow: local.getUTCDay(), min: Infinity, max: -Infinity, conditions: [], wet: false };
    if (typeof lo === "number") b.min = Math.min(b.min, lo);
    if (typeof hi === "number") b.max = Math.max(b.max, hi);
    // Weight the midday reading — it's the one people picture.
    if (main) b.conditions.push(local.getUTCHours() >= 10 && local.getUTCHours() <= 16 ? `${main}!` : main);
    b.wet = b.wet || wet;
    buckets.set(dayKey, b);
  }

  const days: WeatherDay[] = [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .slice(0, 6)
    .map((b, i) => {
      const counts = new Map<string, number>();
      for (const c of b.conditions) {
        const name = c.replace("!", "");
        counts.set(name, (counts.get(name) ?? 0) + (c.endsWith("!") ? 2 : 1));
      }
      const condition = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
      return {
        label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DOW[b.dow],
        min: Number.isFinite(b.min) ? Math.round(b.min) : Math.round(b.max),
        max: Number.isFinite(b.max) ? Math.round(b.max) : Math.round(b.min),
        condition: condition.toLowerCase(),
        wet: b.wet,
      };
    });

  // ponytail: "now" = nearest 3-hour forecast slot (up to ~3h off), not a live /weather call.
  const now = slots[0];
  const nowTemp = now.main?.temp;
  const nowDesc = now.weather?.[0]?.description;
  const head = [nowTemp === undefined ? null : `${Math.round(nowTemp)}°C now`, nowDesc].filter(Boolean).join(", ");
  const outlook = days
    .map((d) => `${d.label} ${d.min}–${d.max}°C${d.condition ? ` ${d.condition}` : ""}${d.wet ? " (wet)" : ""}`)
    .join(" · ");
  const summary = [head, outlook].filter(Boolean).join(". ");

  if (!summary) throw new Error("OpenWeather returned nothing usable");
  return { location: name, summary, days, retrievedAt: new Date().toISOString() };
}
