import { NextResponse } from "next/server";
import type { RouteDay, RouteLeg, RoutePlan } from "@/packages/contracts/route-plan";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { destinationBias } from "@/lib/server/geocode-stop";
import { transit } from "@/packages/providers/google-places/transit";
import { route as mapboxRoute } from "@/packages/providers/mapbox/client";
import { greatCircleArc, haversineKm as haversineKmPoint } from "@/lib/application/geo";
import { pickLegOption, type LegOption } from "@/lib/application/leg-options";
import { computeTimeFit } from "@/lib/application/time-fit";
import { cached } from "@/lib/server/ttl-cache";

type Stop = { id: string; name: string; lat: number; lng: number; time?: string };

// A local reimplementation of this used to live here, missing the `Math.min(1, ...)` clamp
// `lib/application/geo.ts`'s canonical `haversineKm` applies before `Math.asin()` — that guard
// exists because floating-point rounding can push the pre-asin value fractionally past 1 for
// two very close or near-antipodal points, and `Math.asin()` of anything past 1 is `NaN`. The
// duplicate silently lost that fix. Thin adapter instead of a second copy of the formula.
const haversineKm = (a: Stop, b: Stop) => haversineKmPoint({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });

async function coordsFor(title: string, anchor: string, meta: Record<string, unknown> | null, signal?: AbortSignal): Promise<{ lat: number; lng: number } | null> {
  const lat = Number(meta?.latitude);
  const lng = Number(meta?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return { lat, lng };
  try {
    const provider = new GooglePlacesProvider();
    // Phase 4 locationBias fix (docs/overhaul/roadmap/phase-4-recommendation-ranking.md),
    // shared with lib/server/geocode-stop.ts's own use of the same helper.
    const locationBias = anchor ? await destinationBias(provider, anchor) : undefined;
    const hit = (await cached(`geocode:${(title + anchor).toLowerCase()}`, 24 * 60 * 60_000, () =>
      provider.search(anchor ? `${title}, ${anchor}` : title, signal, undefined, locationBias),
    ))[0];
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}

/** All viable ways to make this hop, cached by geography alone (independent of any trip's saved choice). */
async function computeLegOptions(from: Stop, to: Stop, km: number, signal?: AbortSignal): Promise<LegOption[]> {
  const cacheKey = `route-leg-options:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
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
async function planLeg(from: Stop, to: Stop, chosenMode: RouteLeg["mode"] | undefined, signal?: AbortSignal): Promise<RouteLeg> {
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

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { limit: LIMITS.provider });

    const [tripRow, itinRes, choiceRes] = await Promise.all([
      supabase.from("trips").select("destination").eq("id", tripId).maybeSingle(),
      supabase.from("trip_itinerary_items").select("id,title,day_index,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("created_at"),
      supabase.from("trip_decisions").select("value").eq("trip_id", tripId).eq("kind", "leg_transport"),
    ]);
    const anchor = (tripRow.data?.destination ?? "").trim();
    const items = (itinRes.data ?? []) as Array<{ id: string; title: string; day_index: number; metadata: Record<string, unknown> | null }>;
    // Keyed by day too, not just the stop pair — a multi-day trip that revisits the same two
    // stops later on has two distinct legs sharing a pair id; without the day prefix, picking a
    // mode for one silently overwrote the stored choice for the other (both read and write side).
    const legChoices = new Map<string, RouteLeg["mode"]>();
    for (const row of (choiceRes.data ?? []) as Array<{ value: { fromId?: string; toId?: string; mode?: string; dayIndex?: number } }>) {
      if (row.value?.fromId && row.value?.toId && row.value?.mode && row.value?.dayIndex != null) {
        legChoices.set(`${row.value.dayIndex}:${row.value.fromId}:${row.value.toId}`, row.value.mode as RouteLeg["mode"]);
      }
    }

    const byDay = new Map<number, typeof items>();
    for (const it of items) {
      const list = byDay.get(it.day_index) ?? [];
      list.push(it);
      byDay.set(it.day_index, list);
    }

    const unplaced: string[] = [];
    const days: RouteDay[] = [];
    for (const [day, dayItems] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
      // Each stop's geocode is independent — resolved in parallel (like the leg-planning
      // Promise.all just below) instead of one `await` per stop in a loop, which serialized what
      // should be concurrent external lookups (a day with several un-geocoded stops paid for
      // each one's full round trip back-to-back). `Promise.all` still preserves `dayItems`'
      // order regardless of which resolves first, so stop order is unaffected.
      const geocoded = await Promise.all(dayItems.map(async (it) => {
        const c = await coordsFor(it.title, anchor, it.metadata, request.signal);
        const stopTime = typeof it.metadata?.time === "string" ? it.metadata.time : undefined;
        return c ? { title: it.title, stop: { id: it.id, name: it.title, lat: c.lat, lng: c.lng, ...(stopTime ? { time: stopTime } : {}) } as Stop } : { title: it.title, stop: null };
      }));
      const stops: Stop[] = [];
      for (const { title, stop } of geocoded) {
        if (stop) stops.push(stop);
        else unplaced.push(title);
      }
      if (stops.length < 2) {
        days.push({ day, stops, legs: [], summary: { movingMinutes: 0, transitRides: 0, fare: null } });
        continue;
      }
      const pairs = stops.slice(0, -1).map((from, i) => [from, stops[i + 1]] as [Stop, Stop]);
      const legs = await Promise.all(pairs.map(([a, b]) => planLeg(a, b, legChoices.get(`${day}:${a.id}:${b.id}`), request.signal)));
      const movingMinutes = legs.reduce((t, l) => t + (l.minutes ?? 0), 0);
      const transitRides = legs.reduce((t, l) => t + l.steps.filter((s) => s.mode !== "walk").length, 0);
      const fareCur = legs.find((l) => l.fare)?.fare?.currency ?? null;
      const fare = fareCur
        ? { amount: legs.reduce((t, l) => t + (l.fare?.currency === fareCur ? l.fare.amount : 0), 0), currency: fareCur }
        : null;
      days.push({ day, stops, legs, summary: { movingMinutes, transitRides, fare } });
    }

    return NextResponse.json({ days, unplaced } satisfies RoutePlan);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Route plan is unavailable right now");
  }
}
