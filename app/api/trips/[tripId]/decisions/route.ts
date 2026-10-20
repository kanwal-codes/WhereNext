import { NextResponse } from "next/server";
import { decisionInput } from "@/features/trip/domain/decision";
import { stayDecisionSchema } from "@/packages/contracts/stay";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { withRoute, fail } from "@/lib/server/with-route";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

const SELECT = "id,kind,value,source,created_at";

export const GET = withRoute(async (_: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const result = await supabase.from("trip_decisions").select(SELECT).eq("trip_id", tripId).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return NextResponse.json({ decisions: result.data ?? [] });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Decisions unavailable");
  }
});

export const POST = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
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
});

/** Take back a locked stay or flight. Decisions only ever append and the newest of a kind wins, so removing means clearing every row of that kind. */
export const DELETE = withRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const what = new URL(request.url).searchParams.get("kind");
    if (what !== "stay" && what !== "flight") return NextResponse.json({ error: "Only a stay or a flight can be removed" }, { status: 400 });
    const query = supabase.from("trip_decisions").delete().eq("trip_id", tripId);
    // The flight choice is a `transport` decision whose mode is "flight"; other transport decisions (train, car) stay.
    const result = await (what === "stay" ? query.eq("kind", "stay") : query.eq("kind", "transport").eq("value->>mode", "flight"));
    if (result.error) throw result.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Couldn’t remove that");
  }
});
