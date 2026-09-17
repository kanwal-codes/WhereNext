import { weather as openWeather } from "@/packages/providers/openweather/client";
import { weather as googleWeather } from "@/packages/providers/google-weather/client";
import { cached } from "@/lib/server/ttl-cache";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";

type WeatherCall = Extract<ToolCall, { tool: "weather" }>;

// Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — Google Weather pilot: priced
// notably cheaper than OpenWeather at real volume (see google-weather/client.ts's doc comment),
// no confirmed accuracy edge either way, so opt-in via GOOGLE_WEATHER_API_KEY rather than a hard
// swap — same convention as the Exa pilot. This only ever covers the live near-term forecast;
// the separate far-future seasonal fallback (research_web) is untouched either way.
export async function handleWeather(call: WeatherCall, ctx: RetrieveContext): Promise<void> {
  const useGoogle = Boolean(process.env.GOOGLE_WEATHER_API_KEY);
  const provider = useGoogle ? "google-weather" : "openweather";
  // Same reasoning as research_web/events/stays — a forecast for the same place is worth sharing
  // across callers for a few minutes. Not tied to this call's signal — the cached load is shared,
  // so one caller's abort must not cancel it out from under another still waiting on the same key.
  const forecast = await cached(`weather:${provider}:${call.location.trim().toLowerCase()}`, 5 * 60_000, () =>
    useGoogle ? googleWeather(call.location) : openWeather(call.location),
  ).catch(ctx.fail(provider));
  if (forecast) { ctx.weather.summary = forecast.summary; ctx.weather.days = forecast.days; }
}
