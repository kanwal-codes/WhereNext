import { NextResponse } from "next/server";
import { replyFeedbackInput } from "@/features/conversation/domain/replyFeedback";
import { createReplyFeedbackRepository } from "@/features/conversation/infrastructure/replyFeedbackRepository";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail, withRoute } from "@/lib/server/with-route";

/** Set, change or clear (`rating: null`) the signed-in traveller's thumbs on one of Roam's replies in their own thread. */
export const PUT = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = replyFeedbackInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
    const { rating, note } = parsed.data;
    const repo = createReplyFeedbackRepository(supabase);
    const messageId = await repo.findReply(tripId, parsed.data.messageId);
    if (!messageId) return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    if (rating === null) await repo.clear(user.id, messageId);
    else await repo.rate(tripId, user.id, messageId, rating, rating === "down" && note ? note : null);
    return NextResponse.json({ messageId, rating });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Feedback unavailable");
  }
});
