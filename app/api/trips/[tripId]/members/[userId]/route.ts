import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";

const patchSchema = z.object({ role: z.enum(["owner", "editor", "viewer"]) });

async function ownerCount(supabase: Awaited<ReturnType<typeof requireTripMember>>["supabase"], tripId: string): Promise<number> {
  const rows = await supabase.from("trip_members").select("user_id").eq("trip_id", tripId).eq("role", "owner");
  if (rows.error) throw rows.error;
  return rows.data.length;
}

/** Change a member's role. Owner only. Cannot demote the last owner. */
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string; userId: string }> }) {
  try {
    const { tripId, userId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "owner" });
    const { role } = patchSchema.parse(await request.json());

    const current = await supabase.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return NextResponse.json({ error: "Not a member of this trip" }, { status: 404 });
    if (current.data.role === "owner" && role !== "owner" && (await ownerCount(supabase, tripId)) <= 1) {
      return NextResponse.json({ error: "The trip needs at least one owner." }, { status: 409 });
    }
    const updated = await supabase.from("trip_members").update({ role }).eq("trip_id", tripId).eq("user_id", userId);
    if (updated.error) throw updated.error;
    return NextResponse.json({ userId, role });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "That change couldn’t be saved.");
  }
}

/** Remove a member. Owner removes anyone; a member can remove themselves (leave). Never the last owner. */
export async function DELETE(_: Request, { params }: { params: Promise<{ tripId: string; userId: string }> }) {
  try {
    const { tripId, userId } = await params;
    const { supabase, user, role } = await requireTripMember(tripId);
    const isSelf = user.id === userId;
    if (!isSelf && role !== "owner") return NextResponse.json({ error: "Only the owner can remove other people." }, { status: 403 });

    const target = await supabase.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
    if (target.error) throw target.error;
    if (!target.data) return NextResponse.json({ error: "Not a member of this trip" }, { status: 404 });
    if (target.data.role === "owner" && (await ownerCount(supabase, tripId)) <= 1) {
      return NextResponse.json({ error: "The trip needs at least one owner." }, { status: 409 });
    }
    const removed = await supabase.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", userId);
    if (removed.error) throw removed.error;
    return NextResponse.json({ removed: true });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That member couldn’t be removed.");
  }
}
