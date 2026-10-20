import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { createPollInput } from "@/packages/contracts/poll";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";
import { resolvePolls } from "@/lib/server/poll";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

/** Starts a poll — any member, same as sending a group message (a poll IS a message, just a
 *  structured one). Announced as its own group_messages row (kind "poll", metadata: {pollId})
 *  so it appears inline where the group is actually deciding, not on a separate page. */
export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = createPollInput.parse(await request.json());

    // Positional keys ("1", "2", ...) rather than a slug of the label — always unique, and
    // stable even if two options happen to have the same or very similar text.
    const options = parsed.options.map((label, index) => ({ key: String(index + 1), label }));

    const poll = await supabase.from("trip_polls").insert({ trip_id: tripId, created_by: user.id, question: parsed.question, options }).select("id").single();
    if (poll.error) throw poll.error;
    const pollId = poll.data.id as string;

    const message = await createGroupChatRepository(supabase).append(tripId, {
      userId: user.id,
      role: "user",
      kind: "poll",
      content: parsed.question,
      metadata: { pollId },
    });

    const resolved = await resolvePolls(supabase, [pollId], user.id);
    invalidateWorkspace(tripId);
    return NextResponse.json({ message: { ...message, metadata: { ...message.metadata, poll: resolved.get(pollId) } } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid poll" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "The poll couldn’t be created.");
  }
});
