import { NextResponse } from "next/server";
import type { RouteDay, RouteLeg, RoutePlan } from "@/packages/contracts/route-plan";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { transit } from "@/packages/providers/google-places/transit";
import { route as mapboxRoute } from "@/packages/providers/mapbox/client";
import { cached } from "@/lib/server/ttl-cache";

type Stop = { id: string; name: string; lat: number; lng: number };

const R = 6371;
const haversineKm = (a: Stop, b: Stop) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

async function coordsFor(title: string, anchor: string, meta: Record<string, unknown> | null, signal?: AbortSignal): Promise<{ lat: number; lng: number } | null> {
  const lat = Number(meta?.latitude);
  const lng = Number(meta?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return { lat, lng };
  try {
    const hit = (await cached(`geocode:${(title + anchor).toLowerCase()}`, 24 * 60 * 60_000, () =>
      new GooglePlacesProvider().search(anchor ? `${title}, ${anchor}` : title, signal),
    ))[0];
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}

/** One hop between two stops: transit if it's local, driving as a fallback, a "compare options" note if it's intercity. */
async function planLeg(from: Stop, to: Stop, signal?: AbortSignal): Promise<RouteLeg> {
  const base = { fromId: from.id, fromName: from.name, toId: to.id, toName: to.name };
  const km = Math.round(haversineKm(from, to) * 10) / 10;

  if (km > 120) {
    return {
      ...base, kind: "longhaul", mode: "unknown", minutes: null, km, fare: null, departure: null, arrival: null,
      steps: [], polyline: [[from.lng, from.lat], [to.lng, to.lat]],
      note: "Intercity hop — ask the assistant to compare flights, trains and coaches.",
    };
  }

  const cacheKey = `route-leg:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  return cached<RouteLeg>(cacheKey, 30 * 60_000, async () => {
    try {
      const best = (await transit({ origin: [from.lng, from.lat], destination: [to.lng, to.lat] }, signal))[0];
      if (best && best.steps.length) {
        const ride = best.steps.find((s) => s.mode !== "walk");
        const line = best.polyline?.length
          ? best.polyline
          : best.steps.flatMap((s) => s.polyline ?? []);
        return {
          ...base, kind: "local",
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
          polyline: line.length ? line : [[from.lng, from.lat], [to.lng, to.lat]],
          note: null,
        } satisfies RouteLeg;
      }
    } catch {
      /* fall through to driving */
    }
    try {
      const drive = await mapboxRoute({ origin: [from.lng, from.lat], destination: [to.lng, to.lat], profile: "driving" }, signal);
      return {
        ...base, kind: "local", mode: "drive",
        minutes: Math.max(1, Math.round(drive.durationSeconds / 60)),
        km, fare: null, departure: null, arrival: null, steps: [],
        polyline: (drive.geometry?.coordinates as Array<[number, number]>) ?? [[from.lng, from.lat], [to.lng, to.lat]],
        note: "No transit route found — driving time shown.",
      } satisfies RouteLeg;
    } catch {
      return {
        ...base, kind: "local", mode: "unknown", minutes: null, km, fare: null, departure: null, arrival: null, steps: [],
        polyline: [[from.lng, from.lat], [to.lng, to.lat]],
        note: "Couldn't work out a route for this hop.",
      } satisfies RouteLeg;
    }
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);

    const [tripRow, itinRes] = await Promise.all([
      supabase.from("trips").select("destination").eq("id", tripId).maybeSingle(),
      supabase.from("trip_itinerary_items").select("id,title,day_index,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("created_at"),
    ]);
    const anchor = (tripRow.data?.destination ?? "").trim();
    const items = (itinRes.data ?? []) as Array<{ id: string; title: string; day_index: number; metadata: Record<string, unknown> | null }>;

    const byDay = new Map<number, typeof items>();
    for (const it of items) {
      const list = byDay.get(it.day_index) ?? [];
      list.push(it);
      byDay.set(it.day_index, list);
    }

    const unplaced: string[] = [];
    const days: RouteDay[] = [];
    for (const [day, dayItems] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
      const stops: Stop[] = [];
      for (const it of dayItems) {
        const c = await coordsFor(it.title, anchor, it.metadata, request.signal);
        if (c) stops.push({ id: it.id, name: it.title, lat: c.lat, lng: c.lng });
        else unplaced.push(it.title);
      }
      if (stops.length < 2) {
        days.push({ day, stops, legs: [], summary: { movingMinutes: 0, transitRides: 0, fare: null } });
        continue;
      }
      const pairs = stops.slice(0, -1).map((from, i) => [from, stops[i + 1]] as [Stop, Stop]);
      const legs = await Promise.all(pairs.map(([a, b]) => planLeg(a, b, request.signal)));
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
