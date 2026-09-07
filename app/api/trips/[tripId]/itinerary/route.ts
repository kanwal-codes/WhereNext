import { NextResponse } from "next/server";
import { z } from "zod";
import { canChangeLockedItem, itineraryItemSchema, itineraryReorderSchema } from "@/features/itinerary/domain/item";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { geocodeStop } from "@/lib/server/geocode-stop";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

const SELECT = "id,title,day_index,position,metadata,created_at";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase
      .from("trip_itinerary_items")
      .select(SELECT)
      .eq("trip_id", tripId)
      .is("removed_at", null)
      .order("day_index")
      .order("position")
      .order("created_at");
    if (result.error) throw result.error;
    return NextResponse.json({ items: result.data ?? [] });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Itinerary unavailable");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const item = itineraryItemSchema.parse(await request.json());
    const day = item.dayIndex ?? 1;
    const existing = await supabase
      .from("trip_itinerary_items")
      .select(SELECT)
      .eq("trip_id", tripId)
      .eq("title", item.title)
      .is("removed_at", null)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ item: existing.data, alreadyExists: true });
    // New items land at the end of their day.
    const last = await supabase
      .from("trip_itinerary_items")
      .select("position")
      .eq("trip_id", tripId)
      .eq("day_index", day)
      .is("removed_at", null)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = item.position ?? ((last.data?.position ?? -1) + 1);
    const coords = await geocodeStop(supabase, tripId, item.title);
    const metadata: Record<string, unknown> = { locked: item.locked ?? false };
    if (coords) Object.assign(metadata, coords);
    if (item.time) metadata.time = item.time;
    // removed_at must be explicit: upsert only touches columns present in the payload, so a title
    // reused after being soft-deleted would otherwise resurrect with the old removed_at still set
    // and stay invisible to every listing that filters on it.
    const result = await supabase
      .from("trip_itinerary_items")
      .upsert({ trip_id: tripId, title: item.title, day_index: day, position, metadata, removed_at: null }, { onConflict: "trip_id,title" })
      .select(SELECT)
      .single();
    if (result.error) throw result.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ item: result.data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid itinerary item" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Itinerary unavailable");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const raw = await request.json();

    // Bulk reorder — the full new ordering for the days that moved.
    const reorder = itineraryReorderSchema.safeParse(raw);
    if (reorder.success) {
      const locked = await supabase.from("trip_itinerary_items").select("title").eq("trip_id", tripId).is("removed_at", null).contains("metadata", { locked: true });
      if (locked.error) throw locked.error;
      const lockedTitles = new Set((locked.data ?? []).map((r) => r.title));
      for (const row of reorder.data.order) {
        if (lockedTitles.has(row.title)) continue; // locked items don't move
        const upd = await supabase
          .from("trip_itinerary_items")
          .update({ day_index: row.dayIndex, position: row.position })
          .eq("trip_id", tripId)
          .eq("title", row.title);
        if (upd.error) throw upd.error;
      }
      const items = await supabase.from("trip_itinerary_items").select(SELECT).eq("trip_id", tripId).is("removed_at", null).order("day_index").order("position").order("created_at");
      if (items.error) throw items.error;
      invalidateWorkspace(tripId);
      return NextResponse.json({ items: items.data ?? [] });
    }

    const item = itineraryItemSchema
      .refine((value) => value.dayIndex !== undefined || value.locked !== undefined || value.restore !== undefined || value.position !== undefined || value.time !== undefined)
      .parse(raw);
    const existing = await supabase.from("trip_itinerary_items").select("metadata").eq("trip_id", tripId).eq("title", item.title).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!canChangeLockedItem(existing.data.metadata as Record<string, unknown> | null, item)) return NextResponse.json({ error: "Unlock the item before changing it" }, { status: 409 });
    const update: { day_index?: number; position?: number; metadata?: Record<string, unknown>; removed_at?: string | null } = {};
    if (item.restore) update.removed_at = null;
    if (item.dayIndex !== undefined) update.day_index = item.dayIndex;
    if (item.position !== undefined) update.position = item.position;
    if (item.locked !== undefined || item.time !== undefined) {
      const metadata: Record<string, unknown> = { ...(existing.data.metadata ?? {}) };
      if (item.locked !== undefined) metadata.locked = item.locked;
      if (item.time !== undefined) {
        if (item.time === null) delete metadata.time;
        else metadata.time = item.time;
      }
      update.metadata = metadata;
    }
    const result = await supabase.from("trip_itinerary_items").update(update).eq("trip_id", tripId).eq("title", item.title).select(SELECT).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    invalidateWorkspace(tripId);
    return NextResponse.json({ item: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid itinerary item" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Itinerary unavailable");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const { title } = z.object({ title: z.string().trim().min(1).max(200) }).parse(await request.json());
    const existing = await supabase.from("trip_itinerary_items").select("metadata").eq("trip_id", tripId).eq("title", title).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!canChangeLockedItem(existing.data.metadata as Record<string, unknown> | null, {})) return NextResponse.json({ error: "Unlock the item before removing it" }, { status: 409 });
    const result = await supabase.from("trip_itinerary_items").update({ removed_at: new Date().toISOString() }).eq("trip_id", tripId).eq("title", title);
    if (result.error) throw result.error;
    invalidateWorkspace(tripId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid itinerary item" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Itinerary unavailable");
  }
}
