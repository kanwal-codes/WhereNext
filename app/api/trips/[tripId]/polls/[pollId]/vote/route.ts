import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { castVoteInput } from "@/packages/contracts/poll";
import { resolvePolls } from "@/lib/server/poll";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

/** Cast or change a vote — single-choice, so this upserts onto the same (poll, member) row
 *  rather than adding a second one; the primary key on trip_poll_votes already guarantees that. */
export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string; pollId: string }> }) => {
  try {
    const { tripId, pollId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = castVoteInput.parse(await request.json());

    const poll = await supabase.from("trip_polls").select("id,options").eq("id", pollId).eq("trip_id", tripId).maybeSingle();
    if (poll.error) throw poll.error;
    if (!poll.data) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    const validKey = (poll.data.options as Array<{ key: string }>).some((o) => o.key === parsed.optionKey);
    if (!validKey) return NextResponse.json({ error: "Not a real option on this poll" }, { status: 400 });

    const vote = await supabase
      .from("trip_poll_votes")
      .upsert({ poll_id: pollId, trip_id: tripId, user_id: user.id, option_key: parsed.optionKey }, { onConflict: "poll_id,user_id" });
    if (vote.error) throw vote.error;

    invalidateWorkspace(tripId);
    const resolved = await resolvePolls(supabase, [pollId], user.id);
    return NextResponse.json({ poll: resolved.get(pollId) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Your vote couldn’t be saved.");
  }
});
