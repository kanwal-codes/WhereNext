import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { preferencesSchema } from "@/packages/contracts/preferences";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase.from("trip_preferences").select("data,updated_at").eq("trip_id", tripId).maybeSingle();
    if (result.error) throw result.error;
    return NextResponse.json({ memory: result.data?.data ?? {}, updatedAt: result.data?.updated_at ?? null });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Trip memory unavailable");
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner" });
    const memory = preferencesSchema.parse(await request.json());
    const existing = await supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle();
    if (existing.error) throw existing.error;
    const merged = preferencesSchema.parse({ ...(existing.data?.data ?? {}), ...memory });
    const result = await supabase.from("trip_preferences").upsert({ trip_id: tripId, data: merged }).select("data,updated_at").single();
    if (result.error) throw result.error;
    return NextResponse.json({ memory: result.data.data, updatedAt: result.data.updated_at });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid trip memory" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Trip memory unavailable");
  }
}
