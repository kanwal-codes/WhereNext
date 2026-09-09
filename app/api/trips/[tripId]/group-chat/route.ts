import { NextResponse } from "next/server";
import { groupMessageInput } from "@/features/group-chat/domain/message";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    return NextResponse.json({ messages: await createGroupChatRepository(supabase).list(tripId, user.id) });
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
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Group chat unavailable");
  }
}
