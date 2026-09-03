import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase.from("trip_essentials").select("completed,updated_at").eq("trip_id", tripId).maybeSingle();
    if (result.error) throw result.error;
    return NextResponse.json({ completed: result.data?.completed ?? [], updatedAt: result.data?.updated_at ?? null });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Essentials unavailable");
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = z.object({ completed: z.array(z.string().min(1).max(240)).max(50) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid essentials" }, { status: 400 });
    const result = await supabase.from("trip_essentials").upsert({ trip_id: tripId, completed: parsed.data.completed }).select("completed,updated_at").single();
    if (result.error) throw result.error;
    invalidateWorkspace(tripId);
    return NextResponse.json(result.data);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Essentials unavailable");
  }
}
