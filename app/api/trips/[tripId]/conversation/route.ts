import { NextResponse } from "next/server";
import { userMessageInput } from "@/features/conversation/domain/message";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
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

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    return NextResponse.json({ messages: await createConversationRepository(supabase, threadWriter()).list(tripId, user.id) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Conversation unavailable");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const parsed = userMessageInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    return NextResponse.json({ message: await createConversationRepository(supabase, threadWriter()).append(tripId, user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Conversation unavailable");
  }
}
