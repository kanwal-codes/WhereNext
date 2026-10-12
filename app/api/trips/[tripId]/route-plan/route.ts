import { NextResponse } from "next/server";
import type { RouteDay, RouteLeg, RoutePlan } from "@/packages/contracts/route-plan";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";
import { destinationBias } from "@/lib/server/geocode-stop";
import { planLeg, type Stop } from "@/lib/server/plan-leg";
import { cached } from "@/lib/server/ttl-cache";
import { effectiveStops, stopForDate } from "@/lib/trip-stops";
import { isTransit } from "@/lib/trip-reservations";
import { RESERVATION_COLUMNS, toReservation } from "@/packages/contracts/reservation";

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

    const [tripRow, itinRes, choiceRes, bookedRes] = await Promise.all([
      supabase.from("trips").select("destination,start_date,end_date,stops").eq("id", tripId).maybeSingle(),
      supabase.from("trip_itinerary_items").select("id,title,day_index,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("created_at").limit(MAX_PLANNED_ITEMS),
      supabase.from("trip_decisions").select("value").eq("trip_id", tripId).eq("kind", "leg_transport"),
      supabase.from("trip_reservations").select(RESERVATION_COLUMNS).eq("trip_id", tripId).neq("status", "cancelled").limit(120),
    ]);
    const anchor = (tripRow.data?.destination ?? "").trim();
    const tripStart = (tripRow.data?.start_date as string | null) ?? null;
    const route = effectiveStops(tripRow.data);
    const dateOfDay = (day: number): string | null => (tripStart ? new Date(Date.parse(`${tripStart}T00:00:00Z`) + (day - 1) * 86_400_000).toISOString().slice(0, 10) : null);
    // A stop with no saved position is looked up in the city of its own day, not in the whole list of cities.
    const anchorForDay = (day: number): string => stopForDate(route.stops, dateOfDay(day))?.city ?? anchor;
    const booked = (bookedRes.data ?? []).map(toReservation);
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

    // Bookings that fall on a day, with how they read there ("departs 19:40", "check-in 15:00").
    const bookedOn = (day: number): NonNullable<RouteDay["booked"]> => {
      const date = dateOfDay(day);
      if (!date) return [];
      return booked.flatMap((r) => {
        const transit = isTransit(r.kind);
        if (r.startsOn === date) {
          const when = r.startTime ? (r.kind === "stay" ? `check-in ${r.startTime}` : transit ? `departs ${r.startTime}` : r.startTime) : null;
          const route = transit && r.place && r.toPlace ? `${r.place} → ${r.toPlace}` : null;
          return [{ kind: r.kind, title: r.title, detail: [route, when].filter(Boolean).join(" · ") || null }];
        }
        if (r.endsOn === date && r.endsOn !== r.startsOn) {
          const when = r.endTime ? (r.kind === "stay" ? `check-out ${r.endTime}` : transit ? `arrives ${r.endTime}` : r.endTime) : transit ? "arrives" : "check-out";
          return [{ kind: r.kind, title: r.title, detail: when }];
        }
        return [];
      });
    };
    // A travel day with a booked flight or train: the hop says so instead of asking Roam to compare.
    const bookedHop = (day: number): string | null => {
      const date = dateOfDay(day);
      const hop = date ? booked.find((r) => isTransit(r.kind) && r.startsOn === date) : null;
      return hop ? `Booked: ${hop.title}${hop.startTime ? `, departs ${hop.startTime}` : ""}.` : null;
    };

    const unplaced: string[] = [];
    const days: RouteDay[] = [];
    const dayNumbers = new Set<number>([...byDay.keys()]);
    for (let d = 1; d <= 90; d++) if (bookedOn(d).length > 0) dayNumbers.add(d);
    for (const [day, dayItems] of [...[...dayNumbers].sort((a, b) => a - b)].map((n) => [n, byDay.get(n) ?? []] as const)) {
      // Each stop's geocode is independent — resolved in parallel (like the leg-planning
      // Promise.all just below) instead of one `await` per stop in a loop, which serialized what
      // should be concurrent external lookups (a day with several un-geocoded stops paid for
      // each one's full round trip back-to-back). `Promise.all` still preserves `dayItems`'
      // order regardless of which resolves first, so stop order is unaffected.
      const geocoded = await Promise.all(dayItems.map(async (it) => {
        const c = await coordsFor(it.title, anchorForDay(day), it.metadata, request.signal);
        const stopTime = typeof it.metadata?.time === "string" ? it.metadata.time : undefined;
        return c ? { title: it.title, stop: { id: it.id, name: it.title, lat: c.lat, lng: c.lng, ...(stopTime ? { time: stopTime } : {}) } as Stop } : { title: it.title, stop: null };
      }));
      const stops: Stop[] = [];
      for (const { title, stop } of geocoded) {
        if (stop) stops.push(stop);
        else unplaced.push(title);
      }
      const dayBooked = bookedOn(day);
      if (stops.length < 2) {
        days.push({ day, stops, legs: [], summary: { movingMinutes: 0, transitRides: 0, fare: null }, ...(dayBooked.length ? { booked: dayBooked } : {}) });
        continue;
      }
      const pairs = stops.slice(0, -1).map((from, i) => [from, stops[i + 1]] as [Stop, Stop]);
      const hopNote = bookedHop(day);
      const legs = (await Promise.all(pairs.map(([a, b]) => planLeg(a, b, legChoices.get(`${day}:${a.id}:${b.id}`), request.signal, dateOfDay(day))))).map((leg) => (leg.kind === "longhaul" && hopNote ? { ...leg, note: hopNote } : leg));
      const movingMinutes = legs.reduce((t, l) => t + (l.minutes ?? 0), 0);
      const transitRides = legs.reduce((t, l) => t + l.steps.filter((s) => s.mode !== "walk").length, 0);
      const fareCur = legs.find((l) => l.fare)?.fare?.currency ?? null;
      const fare = fareCur
        ? { amount: legs.reduce((t, l) => t + (l.fare?.currency === fareCur ? l.fare.amount : 0), 0), currency: fareCur }
        : null;
      days.push({ day, stops, legs, summary: { movingMinutes, transitRides, fare }, ...(dayBooked.length ? { booked: dayBooked } : {}) });
    }

    return NextResponse.json({ days, unplaced } satisfies RoutePlan);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Route plan is unavailable right now");
  }
}
