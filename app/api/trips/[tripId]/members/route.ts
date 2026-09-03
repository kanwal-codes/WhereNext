import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** List the people on this trip. Any member. */
export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const rows = await supabase.from("trip_members").select("user_id,role,created_at").eq("trip_id", tripId).order("created_at");
    if (rows.error) throw rows.error;

    // Emails live in auth.users — only reachable via the admin client. Names/avatars would come from profiles later.
    const admin = createSupabaseAdminClient();
    const members = await Promise.all(
      (rows.data ?? []).map(async (m) => {
        const who = await admin.auth.admin.getUserById(m.user_id).then((r) => r.data.user, () => null);
        return { userId: m.user_id, role: m.role, joinedAt: m.created_at, email: who?.email ?? null, isYou: m.user_id === user.id };
      }),
    );
    return NextResponse.json({ members });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Trip members are unavailable right now.");
  }
}
