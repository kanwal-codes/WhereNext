import type { RouteLeg } from "@/packages/contracts/route-plan";
import { transit } from "@/packages/providers/google-places/transit";
import { route as mapboxRoute } from "@/packages/providers/mapbox/client";
import { greatCircleArc, haversineKm as haversineKmPoint } from "@/lib/application/geo";
import { pickLegOption, type LegOption } from "@/lib/application/leg-options";
import { computeTimeFit } from "@/lib/application/time-fit";
import { cached } from "@/lib/server/ttl-cache";

export type Stop = { id: string; name: string; lat: number; lng: number; time?: string };

// A local reimplementation of this used to live here, missing the `Math.min(1, ...)` clamp
// `lib/application/geo.ts`'s canonical `haversineKm` applies before `Math.asin()` — that guard
// exists because floating-point rounding can push the pre-asin value fractionally past 1 for
// two very close or near-antipodal points, and `Math.asin()` of anything past 1 is `NaN`. The
// duplicate silently lost that fix. Thin adapter instead of a second copy of the formula.
const haversineKm = (a: Stop, b: Stop) => haversineKmPoint({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });

/** All viable ways to make this hop, cached by geography alone (independent of any trip's saved choice). */
async function computeLegOptions(from: Stop, to: Stop, km: number, signal?: AbortSignal): Promise<LegOption[]> {
  const cacheKey = `route-leg-options:v2:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  return cached<LegOption[]>(cacheKey, 30 * 60_000, async () => {
    const [transitResult, driveResult, walkResult] = await Promise.allSettled([
      transit({ origin: [from.lng, from.lat], destination: [to.lng, to.lat] }, signal),
      mapboxRoute({ origin: [from.lng, from.lat], destination: [to.lng, to.lat], profile: "driving" }, signal),
      km <= 3 ? mapboxRoute({ origin: [from.lng, from.lat], destination: [to.lng, to.lat], profile: "walking" }, signal) : Promise.reject(new Error("too far to walk")),
    ]);

    const options: LegOption[] = [];
    const fallback: Array<[number, number]> = [[from.lng, from.lat], [to.lng, to.lat]];

    if (transitResult.status === "fulfilled" && transitResult.value[0]?.steps.length) {
      const best = transitResult.value[0];
      const ride = best.steps.find((s) => s.mode !== "walk");
      const line = best.polyline?.length ? best.polyline : best.steps.flatMap((s) => s.polyline ?? []);
      options.push({
        mode: ride?.mode ?? "walk",
        minutes: Math.max(1, Math.round(best.durationSeconds / 60)),
        km,
        fare: best.fare ?? null,
        departure: best.departureTime ?? null,
        arrival: best.arrivalTime ?? null,
        steps: best.steps.map((s) => ({
          mode: s.mode, minutes: Math.round(s.durationSeconds / 60),
          line: s.line, agency: s.agency, color: s.color, headsign: s.headsign, stopCount: s.stopCount,
          from: s.departureStop, to: s.arrivalStop,
          polyline: s.polyline,
        })),
        polyline: line.length ? line : fallback,
      });
    }
    if (walkResult.status === "fulfilled") {
      options.push({
        mode: "walk", minutes: Math.max(1, Math.round(walkResult.value.durationSeconds / 60)), km,
        fare: null, departure: null, arrival: null, steps: [],
        polyline: (walkResult.value.geometry?.coordinates as Array<[number, number]>) ?? fallback,
      });
    }
    if (driveResult.status === "fulfilled") {
      options.push({
        mode: "drive", minutes: Math.max(1, Math.round(driveResult.value.durationSeconds / 60)), km,
        fare: null, departure: null, arrival: null, steps: [],
        polyline: (driveResult.value.geometry?.coordinates as Array<[number, number]>) ?? fallback,
      });
    }
    return options;
  });
}

/** One hop between two stops: the rider's saved choice (if any and still available) wins, else transit-first, driving-if-nothing-else, a "compare options" note if it's intercity. */
export async function planLeg(from: Stop, to: Stop, chosenMode: RouteLeg["mode"] | undefined, signal?: AbortSignal): Promise<RouteLeg> {
  const base = { fromId: from.id, fromName: from.name, toId: to.id, toName: to.name };
  const km = Math.round(haversineKm(from, to) * 10) / 10;

  if (km > 120) {
    return {
      ...base, kind: "longhaul", mode: "flight", minutes: null, km, fare: null, departure: null, arrival: null,
      steps: [], polyline: greatCircleArc([from.lng, from.lat], [to.lng, to.lat]),
      note: "Intercity hop — ask Roam to compare flights, trains and coaches.",
      alternatives: [], timeFit: null,
    };
  }

  const options = await computeLegOptions(from, to, km, signal);
  if (options.length === 0) {
    return {
      ...base, kind: "local", mode: "unknown", minutes: null, km, fare: null, departure: null, arrival: null, steps: [],
      polyline: [[from.lng, from.lat], [to.lng, to.lat]],
      note: "Couldn't work out a route for this hop.",
      alternatives: [], timeFit: null,
    };
  }

  const { picked, note, alternatives } = pickLegOption(options, chosenMode);
  const timeFit = computeTimeFit(from.time, to.time, picked.minutes);
  return { ...base, kind: "local", ...picked, note, alternatives, timeFit } satisfies RouteLeg;
}

