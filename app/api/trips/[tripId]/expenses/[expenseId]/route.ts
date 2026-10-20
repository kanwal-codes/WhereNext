import { NextResponse } from "next/server";
import { isUuid, requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

/**
 * Take back an expense kept in this app: the person who logged it, or the trip's owner. One that was also sent to
 * Splitwise stays (removing it here would leave the real debt behind on Splitwise); delete it there.
 */
export const DELETE = withRoute(async (_: Request, { params }: { params: Promise<{ tripId: string; expenseId: string }> }) => {
  try {
    const { tripId, expenseId } = await params;
    const { supabase, user, role } = await requireTripMember(tripId, { role: "editor" });
    if (!isUuid(expenseId)) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    const found = await supabase.from("trip_expenses").select("id,created_by,splitwise_expense_id").eq("trip_id", tripId).eq("id", expenseId).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    if (found.data.splitwise_expense_id) return NextResponse.json({ error: "That one is on Splitwise too. Remove it there." }, { status: 409 });
    if (found.data.created_by !== user.id && role !== "owner") return NextResponse.json({ error: "Only the person who logged it, or the trip's owner, can remove it." }, { status: 403 });
    const removed = await supabase.from("trip_expenses").delete().eq("trip_id", tripId).eq("id", expenseId).select("id");
    if (removed.error) throw removed.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That expense couldn’t be removed.");
  }
});
