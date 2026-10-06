import { NextResponse } from "next/server";
import type { RouteDay, RouteLeg, RoutePlan } from "@/packages/contracts/route-plan";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { destinationBias } from "@/lib/server/geocode-stop";
import { planLeg, type Stop } from "@/lib/server/plan-leg";
import { cached } from "@/lib/server/ttl-cache";

async function coordsFor(title: string, anchor: string, meta: Record<string, unknown> | null, signal?: AbortSignal): Promise<{ lat: number; lng: number } | null> {
  const lat = Number(meta?.latitude);
  const lng = Number(meta?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return { lat, lng };
  try {
    const provider = new GooglePlacesProvider();
    // Phase 4 locationBias fix (docs/overhaul/roadmap/phase-4-recommendation-ranking.md),
    // shared with lib/server/geocode-stop.ts's own use of the same helper.
    const locationBias = anchor ? await destinationBias(provider, anchor) : undefined;
    const hit = (await cached(`geocode:search:${JSON.stringify([title, anchor]).toLowerCase()}`, 24 * 60 * 60_000, () =>
      provider.search(anchor ? `${title}, ${anchor}` : title, signal, undefined, locationBias),
    ))[0];
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}

/** One request plans a leg per consecutive stop pair and each leg is up to three paid provider calls; an itinerary has no
 *  item cap, so bound what a single request will plan (a real trip is well under this). */
const MAX_PLANNED_ITEMS = 80;

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { limit: LIMITS.routes });

    const [tripRow, itinRes, choiceRes] = await Promise.all([
      supabase.from("trips").select("destination").eq("id", tripId).maybeSingle(),
      supabase.from("trip_itinerary_items").select("id,title,day_index,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("created_at").limit(MAX_PLANNED_ITEMS),
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
