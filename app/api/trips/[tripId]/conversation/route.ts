import { NextResponse } from "next/server";
import { userMessageInput } from "@/features/conversation/domain/message";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail, jsonRevalidated } from "@/lib/server/with-route";
import { createConversationRepository } from "@/features/conversation/infrastructure/conversationRepository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Service-role writer used only to create a brand-new trip's thread row; null if unavailable. */
function threadWriter() {
  try {
    return createSupabaseAdminClient();
  } catch {
    return undefined;
  }
}

// How far back the chat opens. This is the only reader of the thread now (the trip's server-rendered
// workspace used to carry the same messages for every page, chat or not), and it had no limit at all,
// unlike every other caller of this repository's `list()`.
const HISTORY_LIMIT = 200;

export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const messages = await createConversationRepository(supabase, threadWriter()).list(tripId, user.id, { limit: HISTORY_LIMIT });
    return jsonRevalidated(request, { messages });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Conversation unavailable");
  }
});

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = userMessageInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    return NextResponse.json({ message: await createConversationRepository(supabase, threadWriter()).append(tripId, user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Conversation unavailable");
  }
});
