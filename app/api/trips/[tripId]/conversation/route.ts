import { NextResponse } from "next/server";
import { userMessageInput } from "@/features/conversation/domain/message";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { createConversationRepository } from "@/features/conversation/infrastructure/conversationRepository";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    return NextResponse.json({ messages: await createConversationRepository(supabase).list(tripId) });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Conversation unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const parsed = userMessageInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    return NextResponse.json({ message: await createConversationRepository(supabase).append(tripId, parsed.data) }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? NextResponse.json({ error: "Conversation unavailable" }, { status: 503 });
  }
}
