import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTripWorkspace } from "@/features/workspace/application/loadTripWorkspace";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const membership = await supabase.from("trip_members").select("trip_id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
    if (!membership.data) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    const workspace = await loadTripWorkspace(supabase, tripId);
    return workspace ? NextResponse.json(workspace) : NextResponse.json({ error: "Trip not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Workspace unavailable" }, { status: 503 });
  }
}
