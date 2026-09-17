import { NextResponse } from "next/server";
import { decisionInput } from "@/features/trip/domain/decision";
import { stayDecisionSchema } from "@/packages/contracts/stay";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

const SELECT = "id,kind,value,source,created_at";

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase.from("trip_decisions").select(SELECT).eq("trip_id", tripId).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return NextResponse.json({ decisions: result.data ?? [] });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Decisions unavailable");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = decisionInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    if (parsed.data.kind === "stay" && !stayDecisionSchema.safeParse(parsed.data.value).success) return NextResponse.json({ error: "Invalid stay decision" }, { status: 400 });
    // "assistant"/"provider" sources are written by trusted server code that talks to the
    // database directly (assistant-turn.ts, the trip-review cron) — never through this route,
    // so a client-supplied source here is never legitimate. Force it rather than trust the body,
    // or any editor could tag their own typed-in decision with a fake "provider-verified" badge.
    const decision = { trip_id: tripId, kind: parsed.data.kind, value: parsed.data.value, source: "user" as const, ...(parsed.data.idempotencyKey ? { idempotency_key: parsed.data.idempotencyKey } : {}) };
    const result = parsed.data.idempotencyKey
      ? await supabase.from("trip_decisions").upsert(decision, { onConflict: "trip_id,idempotency_key" }).select(SELECT).single()
      : await supabase.from("trip_decisions").insert(decision).select(SELECT).single();
    if (result.error) throw result.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ decision: result.data }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Decision could not be saved");
  }
}
