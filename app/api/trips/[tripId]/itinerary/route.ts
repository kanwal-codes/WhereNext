import { NextResponse } from "next/server";
import { z } from "zod";
import { canChangeLockedItem, itineraryItemSchema } from "@/features/itinerary/domain/item";
import { createSupabaseServerClient } from "@/lib/supabase/server";
async function member(tripId: string) { const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return null; const result = await supabase.from("trip_members").select("trip_id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle(); return result.data ? supabase : null; }
export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) { try { const { tripId } = await params; const supabase = await member(tripId); if (!supabase) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const result = await supabase.from("trip_itinerary_items").select("id,title,day_index,metadata,created_at").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("created_at"); if (result.error) throw result.error; return NextResponse.json({ items: result.data ?? [] }); } catch { return NextResponse.json({ error: "Itinerary unavailable" }, { status: 503 }); } }
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) { try { const { tripId } = await params; const supabase = await member(tripId); if (!supabase) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const item = itineraryItemSchema.parse(await request.json()); const result = await supabase.from("trip_itinerary_items").upsert({ trip_id: tripId, title: item.title, day_index: item.dayIndex ?? 1, metadata: { locked: item.locked ?? false } }, { onConflict: "trip_id,title" }).select("id,title,day_index,metadata,created_at").single(); if (result.error) throw result.error; return NextResponse.json({ item: result.data }, { status: 201 }); } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid itinerary item" }, { status: 400 }); return NextResponse.json({ error: "Itinerary unavailable" }, { status: 503 }); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const supabase = await member(tripId);
    if (!supabase) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const item = itineraryItemSchema.refine((value) => value.dayIndex !== undefined || value.locked !== undefined || value.restore !== undefined).parse(await request.json());
    const existing = await supabase.from("trip_itinerary_items").select("metadata").eq("trip_id", tripId).eq("title", item.title).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!canChangeLockedItem(existing.data.metadata as Record<string, unknown> | null, item)) return NextResponse.json({ error: "Unlock the item before changing it" }, { status: 409 });
    const update: { day_index?: number; metadata?: Record<string, unknown>; removed_at?: string | null } = {};
    if (item.restore) update.removed_at = null;
    if (item.dayIndex !== undefined) update.day_index = item.dayIndex;
    if (item.locked !== undefined) update.metadata = { ...(existing.data.metadata ?? {}), locked: item.locked };
    const result = await supabase.from("trip_itinerary_items").update(update).eq("trip_id", tripId).eq("title", item.title).select("id,title,day_index,metadata,created_at").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({ item: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid itinerary item" }, { status: 400 });
    return NextResponse.json({ error: "Itinerary unavailable" }, { status: 503 });
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const supabase = await member(tripId);
    if (!supabase) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { title } = z.object({ title: z.string().trim().min(1).max(200) }).parse(await request.json());
    const existing = await supabase.from("trip_itinerary_items").select("metadata").eq("trip_id", tripId).eq("title", title).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!canChangeLockedItem(existing.data.metadata as Record<string, unknown> | null, {})) return NextResponse.json({ error: "Unlock the item before removing it" }, { status: 409 });
    const result = await supabase.from("trip_itinerary_items").update({ removed_at: new Date().toISOString() }).eq("trip_id", tripId).eq("title", title);
    if (result.error) throw result.error;
    return new Response(null, { status: 204 });
  } catch { return NextResponse.json({ error: "Itinerary unavailable" }, { status: 503 }); }
}
