import { NextResponse } from "next/server";
import { groupMessageInput } from "@/features/group-chat/domain/message";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

// The UI has no "load older messages" affordance yet, so this is a ceiling, not real pagination —
// it just stops a long-running group trip's chat from paging through its entire history (in
// 500-row round trips) on every single load. ponytail: add a cursor + "load more" once a trip's
// history regularly exceeds this.
const HISTORY_LIMIT = 200;

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    return NextResponse.json({ messages: await createGroupChatRepository(supabase).list(tripId, user.id, { limit: HISTORY_LIMIT }) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Group chat unavailable");
  }
}

// Persist-only, like the personal conversation route — an @Roam reply is a separate call
// the client makes after this one succeeds (see group-chat/roam/route.ts), so Roam never
// speaks from this handler.
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = groupMessageInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    const message = await createGroupChatRepository(supabase).append(tripId, {
      userId: user.id,
      role: "user",
      kind: parsed.data.kind,
      content: parsed.data.content,
      metadata: parsed.data.shareCard ? { shareCard: parsed.data.shareCard } : {},
      idempotencyKey: parsed.data.idempotencyKey,
    });
    invalidateWorkspace(tripId);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Group chat unavailable");
  }
}
