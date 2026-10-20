import { interchangeNodes, type MapOverlay } from "@/lib/application/route-overlay";
import type { RoutePlan, RouteDay } from "@/packages/contracts/route-plan";

export type Pin = { id: string; name: string; lng: number; lat: number; kind: "stay" | "eat" | "see" | "do" | "event" | "saved"; day?: number; href?: string };
export type Leg = { polyline: Array<[number, number]>; mode: string; dim?: boolean };
export type SavedRow = { places?: { id: string; name: string; provider_id?: string; category?: string | null; metadata?: { latitude?: number; longitude?: number } | null } };
export type ItineraryRow = { id: string; title: string; day_index: number; metadata?: { latitude?: number; longitude?: number; source?: string; provider_id?: string } | null };
export type StayAnchor = { hotelId: string; hotelName: string; latitude?: number | null; longitude?: number | null };

/** "Wed, Sep 30" for day N of a trip that has a start date. */
export function dayDate(startDate: string | null | undefined, dayN: number): string | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (dayN - 1));
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const coords = (m?: { latitude?: number; longitude?: number } | null) => {
  const lng = Number(m?.longitude);
  const lat = Number(m?.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0) ? { lng, lat } : null;
};

/** Every place the map pins: the booked stay first, then the itinerary, the plan's own stops, and saved places not already there. */
export function buildPins(input: { itinerary: ItineraryRow[]; saved: SavedRow[]; plan: RoutePlan | null; stay: StayAnchor | null; tripId: string; kindOf: (category?: string | null) => Pin["kind"] }): Pin[] {
  const { itinerary, saved, plan, stay, tripId, kindOf } = input;
  const out: Pin[] = [];
  const seenIds = new Set<string>();
  for (const i of itinerary) {
    const c = coords(i.metadata);
    const providerId = i.metadata?.provider_id;
    if (c) {
      out.push({ id: `it-${i.id}`, name: i.title, ...c, kind: "see", day: i.day_index, href: providerId ? `/trips/${tripId}/place/${encodeURIComponent(providerId)}` : undefined });
      seenIds.add(i.id);
    }
  }
  // The route plan live-geocodes every stop server-side, even ones with no coordinates saved on
  // the itinerary row itself (older items added before that started happening). Fold those in
  // too so the map isn't stuck on the empty state for a trip that otherwise has a real plan.
  for (const day of plan?.days ?? []) {
    for (const stop of day.stops) {
      if (seenIds.has(stop.id)) continue;
      out.push({ id: `it-${stop.id}`, name: stop.name, lng: stop.lng, lat: stop.lat, kind: "see", day: day.day });
      seenIds.add(stop.id);
    }
  }
  const pinnedKey = new Set(out.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`));
  for (const s of saved) {
    const p = s.places;
    const c = coords(p?.metadata);
    if (p && c && !pinnedKey.has(`${c.lng.toFixed(4)},${c.lat.toFixed(4)}`)) {
      out.push({ id: p.id, name: p.name, ...c, kind: kindOf(p.category), href: p.provider_id ? `/trips/${tripId}/place/${encodeURIComponent(p.provider_id)}` : undefined });
    }
  }
  if (stay && stay.latitude != null && stay.longitude != null) {
    out.unshift({ id: "stay", name: stay.hotelName, lng: stay.longitude, lat: stay.latitude, kind: "stay", href: `/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}` });
  }
  return out;
}

/** The day numbers the trip has, from its pins and from the plan, in order. */
export function dayNumbers(pins: Pin[], plan: RoutePlan | null): number[] {
  const fromPins = pins.map((p) => p.day).filter((d): d is number => typeof d === "number");
  const fromPlan = (plan?.days ?? []).map((d) => d.day);
  return Array.from(new Set([...fromPins, ...fromPlan])).sort((a, b) => a - b);
}

/** The plan's days for the chosen day (all of them when none is chosen). */
export const daysShown = (plan: RoutePlan | null, activeDay: number | "all"): RouteDay[] =>
  activeDay === "all" ? (plan?.days ?? []) : (plan?.days ?? []).filter((d) => d.day === activeDay);

/** A journey that changes vehicle is drawn as its parts, each in its own mode; one without per-step lines is drawn whole. The hop the pointer is not on is dimmed. */
export function mapLegsFor(planDays: RouteDay[], activeDay: number | "all", hoverLeg: number | null): Leg[] {
  return planDays.flatMap((d, di) =>
    d.legs.flatMap((l, li) => {
      const dim = activeDay !== "all" && hoverLeg != null && !(di === 0 && li === hoverLeg);
      const parts = l.steps.length > 0 && l.steps.every((st) => (st.polyline?.length ?? 0) >= 2);
      return parts ? l.steps.map((st) => ({ polyline: st.polyline!, mode: st.mode, dim })) : [{ polyline: l.polyline, mode: l.mode, dim }];
    }),
  );
}

/** Where the day changes vehicle, and the time of the hop the pointer is on. */
export function dayOverlayFor(planDays: RouteDay[], hoverLeg: number | null, activeDay: number | "all", formatMinutes: (minutes: number) => string): MapOverlay {
  const nodes = planDays.flatMap((d) =>
    d.legs.flatMap((l, li) =>
      l.steps.length > 1 && l.steps.every((st) => (st.polyline?.length ?? 0) >= 2)
        ? interchangeNodes(l.steps.map((st) => ({ mode: st.mode, polyline: st.polyline, from: st.from, to: st.to })), `d${d.day}-${li}`)
        : [],
    ),
  );
  const leg = hoverLeg != null && activeDay !== "all" ? planDays[0]?.legs[hoverLeg] : undefined;
  const pills = leg && leg.polyline.length > 1 && leg.minutes != null ? [{ id: "hover", polyline: leg.polyline, text: formatMinutes(leg.minutes), tone: "main" as const }] : [];
  return { nodes, pills };
}

/** The ways of getting around that are drawn right now. */
export function modesDrawn(tab: "trip" | "browse", planDays: RouteDay[], browseLegs: Array<{ mode: string }> | null): string[] {
  const seen = new Set<string>();
  if (tab === "browse") for (const l of browseLegs ?? []) seen.add(l.mode);
  else for (const d of planDays) for (const l of d.legs) if (l.polyline.length > 1) for (const m of l.steps.length ? l.steps.map((st) => st.mode) : [l.mode]) seen.add(m);
  return Array.from(seen);
}
