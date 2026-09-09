import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

const reactionInput = z.object({ emoji: z.string().trim().min(1).max(8) });

// Toggle: react if the caller hasn't on this message with this emoji yet, un-react if they
// have. RLS also enforces `user_id = auth.uid()` on group_message_reactions, but checking
// membership here first gives a clean 404/403 instead of a silent RLS-denied write.
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string; messageId: string }> }) {
  try {
    const { tripId, messageId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = reactionInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    const { emoji } = parsed.data;

    const existing = await supabase
      .from("group_message_reactions")
      .select("message_id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji)
      .maybeSingle();
    if (existing.error) throw existing.error;

    if (existing.data) {
      const result = await supabase.from("group_message_reactions").delete().eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji);
      if (result.error) throw result.error;
    } else {
      const result = await supabase.from("group_message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
      // A racing double-tap can lose the read-then-write check above to another request for the
      // same (message, user, emoji) — the primary key then rejects the second insert. That's the
      // same end state the caller wanted (reacted), so treat it as success rather than a 500.
      if (result.error && result.error.code !== "23505") throw result.error;
    }
    invalidateWorkspace(tripId);
    return NextResponse.json({ reacted: !existing.data });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Reaction unavailable");
  }
}
