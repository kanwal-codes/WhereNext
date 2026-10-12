import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { mergePreferences, preferenceUpdateSchema } from "@/packages/contracts/preferences";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { updateTripPreferences } from "@/lib/server/trip-preferences";

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
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const memory = preferenceUpdateSchema.parse(await request.json());
    const result = await updateTripPreferences(supabase, tripId, (previous) => mergePreferences(previous, memory));
    invalidateWorkspace(tripId);
    return NextResponse.json({ memory: result.data, updatedAt: result.updated_at });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid trip memory" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Trip memory unavailable");
  }
}
