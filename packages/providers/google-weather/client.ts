import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import { cached } from "@/lib/server/ttl-cache";
import { GooglePlacesProvider } from "../google-places/client";
import type { WeatherDay, WeatherResult } from "../openweather/client";

/**
 * Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — a pilot alternative to
 * OpenWeather for the live near-term forecast, per docs/overhaul/chatbot-overhaul/data-providers.md:
 * Google's Weather API (GA June 2025) prices at $0.15/1,000 calls with a 10k/month free tier,
 * notably cheaper than OpenWeather's paid tiers at any real volume. No accuracy edge was found
 * either way, so this is a cost trade, not a strict upgrade — same "pilot, don't replace outright"
 * treatment as the Exa pilot (see research-web.ts), gated behind its own key.
 *
 * Deliberately NOT a candidate for this app's seasonal/climatology fallback (far-future trips
 * that a live forecast can't reach) — Google's Weather API has no confirmed historical-averages
 * endpoint, and that fallback already lives in a separate path (RESOLVE routing a far-future
 * weather question through `research_web` instead of this tool at all — see
 * `handleWeather`/`turn-resolver.ts`). This client only ever answers the same ~10-day-ahead
 * question OpenWeather's `weather()` does.
 *
 * Caveat: implemented against Google's publicly documented `forecast/days:lookup` response shape
 * (Weather API GA docs, June 2025) — every field is read defensively (optional-chained, same
 * style as openweather/client.ts) since it hasn't been exercised against a live key in this
 * environment. Verify field names against a real response before relying on this in production.
 */

const WET_TYPES = new Set(["RAIN", "LIGHT_RAIN", "HEAVY_RAIN", "RAIN_SHOWERS", "SNOW", "LIGHT_SNOW", "HEAVY_SNOW", "SNOW_SHOWERS", "THUNDERSTORM", "DRIZZLE"]);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ForecastDay = {
  displayDate?: { year?: number; month?: number; day?: number };
  maxTemperature?: { degrees?: number };
  minTemperature?: { degrees?: number };
  daytimeForecast?: { weatherCondition?: { type?: string; description?: { text?: string } } };
};
type ForecastResponse = { forecastDays?: ForecastDay[] };

function apiKey(): string {
  const key = process.env.GOOGLE_WEATHER_API_KEY;
  if (!key) throw new Error("GOOGLE_WEATHER_API_KEY is not configured");
  return key;
}

/** First Places hit's coordinates — reuses this app's existing Google Places search rather than
 *  a second geocoding product, cached the same 24h every other geocode-for-weather lookup uses. */
async function geocode(place: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string }> {
  return cached(`google-weather:geo:${place.trim().toLowerCase()}`, 24 * 60 * 60_000, async () => {
    const [hit] = await new GooglePlacesProvider().search(place, signal, 1);
    if (!hit) throw new Error(`Google Weather could not locate "${place}"`);
    return { lat: hit.latitude, lon: hit.longitude, name: hit.name };
  });
}

export async function weather(place: string, signal?: AbortSignal): Promise<WeatherResult> {
  const { lat, lon, name } = await geocode(place, signal);
  const fc = await cached(`google-weather:fc:${lat.toFixed(2)},${lon.toFixed(2)}`, 30 * 60_000, async () => {
    const url = `https://weather.googleapis.com/v1/forecast/days:lookup?key=${apiKey()}&location.latitude=${lat}&location.longitude=${lon}&days=6`;
    const res = await guardedFetch("google-weather", url, { signal: withProviderTimeout(signal) });
    if (!res.ok) throw new Error(`Google Weather forecast failed: ${res.status}`);
    return (await res.json()) as ForecastResponse;
  });

  const forecastDays = fc.forecastDays ?? [];
  if (forecastDays.length === 0) throw new Error("Google Weather returned no forecast days");

  const days: WeatherDay[] = forecastDays.slice(0, 6).map((d, i) => {
    const type = d.daytimeForecast?.weatherCondition?.type ?? "";
    const min = d.minTemperature?.degrees;
    const max = d.maxTemperature?.degrees;
    const dow = d.displayDate?.year && d.displayDate.month && d.displayDate.day
      ? new Date(Date.UTC(d.displayDate.year, d.displayDate.month - 1, d.displayDate.day)).getUTCDay()
      : (new Date().getUTCDay() + i) % 7;
    return {
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DOW[dow],
      min: typeof min === "number" ? Math.round(min) : typeof max === "number" ? Math.round(max) : 0,
      max: typeof max === "number" ? Math.round(max) : typeof min === "number" ? Math.round(min) : 0,
      condition: (d.daytimeForecast?.weatherCondition?.description?.text ?? "").toLowerCase(),
      wet: WET_TYPES.has(type),
    };
  });

  const outlook = days.map((d) => `${d.label} ${d.min}–${d.max}°C${d.condition ? ` ${d.condition}` : ""}${d.wet ? " (wet)" : ""}`).join(" · ");
  if (!outlook) throw new Error("Google Weather returned nothing usable");
  return { location: name, summary: outlook, days, retrievedAt: new Date().toISOString() };
}
