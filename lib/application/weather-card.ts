import { z } from "zod";
import type { WeatherDay } from "@/packages/providers/openweather/client";
import { createBulkGateway } from "@/packages/ai/gateway";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";

/** The weather-block fields (everything except `type`/`retrievedAt`, which the route adds). */
export type WeatherCard = {
  location: string;
  mode: "forecast" | "seasonal";
  month?: string;
  headline: string;
  highC?: number;
  lowC?: number;
  condition?: "clear" | "clouds" | "rain" | "snow" | "mixed";
  rainyDays?: number;
  packing: string[];
  days: Array<{ label: string; min: number; max: number; condition: "clear" | "clouds" | "rain" | "snow" | "mixed"; wet: boolean }>;
};

const CONDITIONS = ["clear", "clouds", "rain", "snow", "mixed"] as const;

/** OpenWeather `main` strings (and a few free-text words) → the block's 5-way enum. */
function normalizeCondition(raw: string): (typeof CONDITIONS)[number] {
  const s = raw.toLowerCase();
  if (/snow|sleet|flurr/.test(s)) return "snow";
  if (/rain|drizzle|thunder|shower/.test(s)) return "rain";
  if (/clear|sun/.test(s)) return "clear";
  if (/cloud|overcast|fog|mist|haze/.test(s)) return "clouds";
  return "mixed";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function band(maxC: number): "warm" | "mild" | "cool" | "cold" {
  return maxC >= 24 ? "warm" : maxC >= 16 ? "mild" : maxC >= 8 ? "cool" : "cold";
}

function packingFor(b: ReturnType<typeof band>, wet: boolean): string[] {
  const base =
    b === "cold" ? ["Warm coat", "Hat & gloves", "Warm layers"]
    : b === "cool" ? ["Warm layer", "Light jacket", "Closed shoes"]
    : b === "mild" ? ["Light jacket for evenings", "Comfortable shoes"]
    : ["Light clothing", "Sun cover", "Refillable water"];
  return wet ? [...base, "Waterproof shell"] : base;
}

/** Build a forecast card straight from the provider's day buckets — no model call. */
export function weatherCardFromForecast(location: string, days: WeatherDay[]): WeatherCard | null {
  if (!days.length) return null;
  const slice = days.slice(0, 8);
  const maxAvg = Math.round(mean(slice.map((d) => d.max)));
  const minAvg = Math.round(mean(slice.map((d) => d.min)));
  const wetCount = slice.filter((d) => d.wet).length;
  const b = band(maxAvg);
  const wetPhrase =
    wetCount >= Math.ceil(slice.length / 2) ? " and often wet" : wetCount ? " with a wet spell" : "";
  const steer =
    b === "cold" ? "pack a warm coat" : b === "cool" ? "bring layers" : b === "mild" ? "a light jacket for evenings" : "light clothes and sun cover";
  const counts = new Map<string, number>();
  for (const d of slice) counts.set(normalizeCondition(d.condition), (counts.get(normalizeCondition(d.condition)) ?? 0) + 1);
  const condition = ([...counts.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] as WeatherCard["condition"]) ?? "mixed";
  return {
    location,
    mode: "forecast",
    headline: `${b[0].toUpperCase()}${b.slice(1)}${wetPhrase} — ${steer}.`,
    highC: maxAvg,
    lowC: minAvg,
    condition,
    packing: packingFor(b, wetCount > 0),
    days: slice.map((d) => ({ label: d.label, min: d.min, max: d.max, condition: normalizeCondition(d.condition), wet: d.wet })),
  };
}

const seasonalSchema = z.object({
  highC: z.coerce.number().int().min(-60).max(60),
  lowC: z.coerce.number().int().min(-70).max(50),
  condition: z.enum(CONDITIONS),
  rainyDays: z.coerce.number().int().min(0).max(31),
  headline: z.string().min(1).max(160),
  packing: z.array(z.string().max(40)).max(5),
});

const SEASONAL_SYSTEM =
  "You are given web notes about a destination's TYPICAL weather in a given month (climate normals, not a forecast). " +
  "Return ONLY JSON: {\"highC\":int,\"lowC\":int,\"condition\":\"clear|clouds|rain|snow|mixed\",\"rainyDays\":int,\"headline\":string,\"packing\":string[]}. " +
  "highC/lowC = typical daily high/low in Celsius for that month. rainyDays = typical number of wet days in the month. " +
  "condition = the month's dominant sky. headline = ONE short phrase: the feel of it plus a packing steer (e.g. \"Cool and damp — bring layers and a waterproof shell\"). " +
  "packing = 2–4 short items (e.g. \"Warm layer\", \"Waterproof shell\", \"Comfortable boots\"). No prose outside the JSON.";

/**
 * Structured typical-weather for a month, distilled from web notes the pipeline already
 * retrieved. One bulk-model call; returns null if there's nothing to work from.
 */
export async function weatherCardFromSeasonal(
  location: string,
  month: string,
  notes: string,
  signal?: AbortSignal,
): Promise<WeatherCard | null> {
  const trimmed = notes.trim();
  if (trimmed.length < 80) return null;
  try {
    const raw = await createBulkGateway().generateStructured(
      [
        { role: "system", content: SEASONAL_SYSTEM },
        { role: "user", content: `${location} — typical weather in ${month}:\n${trimmed.slice(0, 3500)}` },
      ],
      withDeadline(signal, AI_DEADLINE_MS.sideBuilder),
    );
    const parsed = seasonalSchema.parse(raw);
    return {
      location,
      mode: "seasonal",
      month,
      headline: parsed.headline,
      highC: parsed.highC,
      lowC: parsed.lowC,
      condition: parsed.condition,
      rainyDays: parsed.rainyDays,
      packing: parsed.packing.length ? parsed.packing.slice(0, 5) : packingFor(band(parsed.highC), parsed.rainyDays >= 8),
      days: [],
    };
  } catch {
    return null;
  }
}
