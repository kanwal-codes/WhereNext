import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PublicTrip = {
  name: string;
  destination: string;
  durationDays: number | null;
  startDate: string | null;
  endDate: string | null;
  itinerary: Array<{ dayIndex: number; title: string; latitude: number | null; longitude: number | null }>;
  places: Array<{ name: string; category: string | null; address: string | null; latitude: number | null; longitude: number | null }>;
  decisions: Array<{ kind: string; value: Record<string, unknown> }>;
};

const coord = (m: unknown, key: "latitude" | "longitude"): number | null => {
  const v = (m as Record<string, unknown> | null)?.[key];
  return typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null;
};

/**
 * Read-only projection of a trip shared with `share_visibility = 'link'`. Uses
 * the service-role client because there is no anon RLS policy — the slug filter
 * and the visibility check ARE the access control. Returns null for a bad slug
 * or a trip that is no longer shared.
 */
export async function loadPublicTrip(slug: string): Promise<PublicTrip | null> {
  if (!/^[a-f0-9]{8,64}$/.test(slug)) return null;
  const admin = createSupabaseAdminClient();

  const trip = await admin
    .from("trips")
    .select("id,name,destination,duration_days,start_date,end_date,share_visibility")
    .eq("share_slug", slug)
    .maybeSingle();
  if (trip.error || !trip.data || trip.data.share_visibility !== "link") return null;

  const [itinerary, places, decisions] = await Promise.all([
    admin.from("trip_itinerary_items").select("title,day_index,metadata").eq("trip_id", trip.data.id).is("removed_at", null).order("day_index").order("position").order("created_at"),
    admin.from("trip_places").select("places(name,category,address,metadata)").eq("trip_id", trip.data.id).eq("status", "saved"),
    admin.from("trip_decisions").select("kind,value").eq("trip_id", trip.data.id).in("kind", ["stay_area", "stay", "transport", "flight"]),
  ]);

  return {
    name: trip.data.name,
    destination: trip.data.destination,
    durationDays: trip.data.duration_days ?? null,
    startDate: trip.data.start_date ?? null,
    endDate: trip.data.end_date ?? null,
    itinerary: (itinerary.data ?? []).map((i) => ({
      dayIndex: Number(i.day_index) || 1,
      title: String(i.title),
      latitude: coord(i.metadata, "latitude"),
      longitude: coord(i.metadata, "longitude"),
    })),
    places: (places.data ?? []).flatMap((row) => {
      const p = (row as { places?: Record<string, unknown> | Record<string, unknown>[] }).places;
      const one = Array.isArray(p) ? p[0] : p;
      if (!one) return [];
      return [{
        name: String(one.name ?? ""),
        category: (one.category as string) ?? null,
        address: (one.address as string) ?? null,
        latitude: coord(one.metadata, "latitude"),
        longitude: coord(one.metadata, "longitude"),
      }];
    }),
    decisions: (decisions.data ?? []).map((d) => ({ kind: String(d.kind), value: (d.value ?? {}) as Record<string, unknown> })),
  };
}
