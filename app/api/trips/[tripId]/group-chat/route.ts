import { NextResponse } from "next/server";
import { GROUP_HISTORY_LIMIT, groupMessageInput } from "@/features/group-chat/domain/message";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail, jsonRevalidated } from "@/lib/server/with-route";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";

// The newest GROUP_HISTORY_LIMIT messages, or with `?before=<ISO time>` the page of history just older than that,
// or with `?after=<ISO time>` only what was sent since (oldest first): an open chat's cheap check for news.
export const GET = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const query = new URL(request.url).searchParams;
    const before = query.get("before");
    const after = query.get("after");
    if ((before && Number.isNaN(Date.parse(before))) || (after && Number.isNaN(Date.parse(after)))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    const messages = await createGroupChatRepository(supabase).list(tripId, user.id, { limit: GROUP_HISTORY_LIMIT, before: before ?? undefined, after: after ?? undefined });
    return jsonRevalidated(request, { messages });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Group chat unavailable");
  }
});

// Persist-only, like the personal conversation route — an @Roam reply is a separate call
// the client makes after this one succeeds (see group-chat/roam/route.ts), so Roam never
// speaks from this handler.
export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = groupMessageInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    // Only people who are on this trip, and never yourself: a made-up id is dropped, not stored.
    const wanted = [...new Set(parsed.data.mentions ?? [])].filter((id) => id !== user.id);
    const mentions = wanted.length === 0 ? [] : ((await supabase.from("trip_members").select("user_id").eq("trip_id", tripId).in("user_id", wanted)).data ?? []).map((row) => row.user_id as string);
    const message = await createGroupChatRepository(supabase).append(tripId, {
      userId: user.id,
      role: "user",
      kind: parsed.data.kind,
      content: parsed.data.content,
      metadata: { ...(parsed.data.shareCard ? { shareCard: parsed.data.shareCard } : {}), ...(mentions.length > 0 ? { mentions } : {}) },
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Group chat unavailable");
  }
});
