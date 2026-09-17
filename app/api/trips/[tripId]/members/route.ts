import { NextResponse } from "next/server";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { tripMemberIdentities } from "@/lib/server/trip-member-identities";

type RoleRow = { user_id: string; role: string; created_at: string };

/** List the people on this trip. Any member.
 *
 * `isYou` depends on the caller, so it's computed after the cached lookup rather than
 * baked into the cached rows — otherwise the first caller's identity would leak into
 * every other member's view of "isYou" for the rest of the TTL. */
export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);

    // Role/joined-at (RLS-scoped, cheap) and email/name (Auth Admin API, shared with the
    // group-chat @Roam route via tripMemberIdentities so the two don't each independently fan
    // out the same N admin lookups) are cached separately — this endpoint is hit by more than
    // one component on the same page load, so a short TTL still turns N round trips into ~1.
    const [roleRows, identities] = await Promise.all([
      cached(`members:${tripId}`, 30_000, async (): Promise<RoleRow[]> => {
        const result = await supabase.from("trip_members").select("user_id,role,created_at").eq("trip_id", tripId).order("created_at");
        if (result.error) throw result.error;
        return result.data;
      }),
      tripMemberIdentities(tripId),
    ]);

    const members = roleRows.map((m) => ({
      userId: m.user_id,
      role: m.role,
      joinedAt: m.created_at,
      email: identities.get(m.user_id)?.email ?? null,
      isYou: m.user_id === user.id,
    }));
    return NextResponse.json({ members });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Trip members are unavailable right now.");
  }
}
