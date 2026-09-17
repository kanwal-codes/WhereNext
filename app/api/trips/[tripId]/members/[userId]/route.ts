import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidate } from "@/lib/server/ttl-cache";

const patchSchema = z.object({ role: z.enum(["owner", "editor", "viewer"]) });

/** Maps the two known guard failures from change_trip_member_role/remove_trip_member (0028)
 *  to their HTTP shape; anything else is a genuine unexpected error. */
function ownerGuardResponse(error: { message: string }): NextResponse | null {
  if (error.message.includes("at least one owner")) return NextResponse.json({ error: "The trip needs at least one owner." }, { status: 409 });
  if (error.message.includes("not a member")) return NextResponse.json({ error: "Not a member of this trip" }, { status: 404 });
  return null;
}

/** Change a member's role. Owner only. Cannot demote the last owner.
 *  The owner-count check and the write happen atomically in change_trip_member_role (0028) — a
 *  row lock on the trip's membership for the transaction's duration closes the race a
 *  read-then-write here couldn't: two concurrent demotions of different owners can no longer
 *  both pass a check before either write lands. */
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string; userId: string }> }) {
  try {
    const { tripId, userId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner" });
    const { role } = patchSchema.parse(await request.json());

    const result = await supabase.rpc("change_trip_member_role", { p_trip_id: tripId, p_user_id: userId, p_new_role: role });
    if (result.error) {
      const guarded = ownerGuardResponse(result.error);
      if (guarded) return guarded;
      throw result.error;
    }

    await invalidate(`members:${tripId}`);
    return NextResponse.json({ userId, role });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "That change couldn’t be saved.");
  }
}

/** Remove a member. Owner removes anyone; a member can remove themselves (leave). Never the
 *  last owner — same atomic guard as PATCH above, via remove_trip_member (0028). */
export async function DELETE(_: Request, { params }: { params: Promise<{ tripId: string; userId: string }> }) {
  try {
    const { tripId, userId } = await params;
    const { supabase, user, role } = await requireTripMember(tripId);
    const isSelf = user.id === userId;
    if (!isSelf && role !== "owner") return NextResponse.json({ error: "Only the owner can remove other people." }, { status: 403 });

    const result = await supabase.rpc("remove_trip_member", { p_trip_id: tripId, p_user_id: userId });
    if (result.error) {
      const guarded = ownerGuardResponse(result.error);
      if (guarded) return guarded;
      throw result.error;
    }

    await Promise.all([invalidate(`members:${tripId}`), invalidate(`member-identities:${tripId}`)]);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That member couldn’t be removed.");
  }
}
