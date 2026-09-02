import { withProviderTimeout } from "../request-signal";

export type WeatherResult = { location: string; summary: string; retrievedAt: string };

export async function weather(location: { latitude: number; longitude: number; name: string }, signal?: AbortSignal): Promise<WeatherResult> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error("OPENWEATHER_API_KEY is not configured");
  const url = new URL("https://api.openweathermap.org/data/3.0/onecall");
  url.searchParams.set("lat", String(location.latitude));
  url.searchParams.set("lon", String(location.longitude));
  url.searchParams.set("exclude", "minutely,alerts");
  url.searchParams.set("units", "metric");
  url.searchParams.set("appid", key);
  const response = await fetch(url, { signal: withProviderTimeout(signal) });
  if (!response.ok) throw new Error(`OpenWeather request failed: ${response.status}`);
  const body = await response.json() as { current?: { temp?: number; weather?: Array<{ description?: string }> }; daily?: Array<{ temp?: { min?: number; max?: number }; weather?: Array<{ description?: string }> }> };
  const today = body.daily?.[0];
  return { location: location.name, summary: [body.current?.temp === undefined ? null : `${Math.round(body.current.temp)}°C now`, body.current?.weather?.[0]?.description, today?.temp?.min === undefined || today.temp.max === undefined ? null : `${Math.round(today.temp.min)}–${Math.round(today.temp.max)}°C today`, today?.weather?.[0]?.description].filter(Boolean).join(", "), retrievedAt: new Date().toISOString() };
}
