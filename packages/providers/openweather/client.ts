import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

export type WeatherDay = { label: string; min: number; max: number; condition: string; wet: boolean };
export type WeatherResult = { location: string; summary: string; days: WeatherDay[]; retrievedAt: string };

type CurrentResponse = { main?: { temp?: number }; weather?: Array<{ description?: string; main?: string }> };
type ForecastResponse = {
  city?: { timezone?: number };
  list?: Array<{ dt: number; main?: { temp?: number; temp_min?: number; temp_max?: number }; weather?: Array<{ main?: string; description?: string }>; rain?: unknown; snow?: unknown }>;
};

const WET = new Set(["Rain", "Drizzle", "Thunderstorm", "Snow"]);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Current conditions + a ~5-day outlook. Uses the free 2.5 endpoints
 * (`/weather` + `/forecast`) — One Call 3.0 needs a paid subscription and 401s
 * on a standard key.
 */
export async function weather(
  location: { latitude: number; longitude: number; name: string },
  signal?: AbortSignal,
): Promise<WeatherResult> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error("OPENWEATHER_API_KEY is not configured");
  const qs = `lat=${location.latitude}&lon=${location.longitude}&units=metric&appid=${key}`;
  const timeout = withProviderTimeout(signal);

  const [curRes, fcRes] = await Promise.all([
    guardedFetch("openweather", `https://api.openweathermap.org/data/2.5/weather?${qs}`, { signal: timeout }),
    guardedFetch("openweather", `https://api.openweathermap.org/data/2.5/forecast?${qs}`, { signal: timeout }),
  ]);
  if (!curRes.ok && !fcRes.ok) throw new Error(`OpenWeather request failed: ${curRes.status}/${fcRes.status}`);

  const cur = (curRes.ok ? await curRes.json() : {}) as CurrentResponse;
  const fc = (fcRes.ok ? await fcRes.json() : {}) as ForecastResponse;

  // Bucket the 3-hour slots into local calendar days.
  const tz = fc.city?.timezone ?? 0;
  const buckets = new Map<string, { order: number; dow: number; min: number; max: number; conditions: string[]; wet: boolean }>();
  for (const slot of fc.list ?? []) {
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

  const nowTemp = cur.main?.temp;
  const nowDesc = cur.weather?.[0]?.description;
  const head = [nowTemp === undefined ? null : `${Math.round(nowTemp)}°C now`, nowDesc].filter(Boolean).join(", ");
  const outlook = days
    .map((d) => `${d.label} ${d.min}–${d.max}°C${d.condition ? ` ${d.condition}` : ""}${d.wet ? " (wet)" : ""}`)
    .join(" · ");
  const summary = [head, outlook].filter(Boolean).join(". ");

  if (!summary) throw new Error("OpenWeather returned nothing usable");
  return { location: location.name, summary, days, retrievedAt: new Date().toISOString() };
}
