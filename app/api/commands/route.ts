import { NextResponse } from "next/server";
import { z } from "zod";
import { proposedCommandSchema } from "@/packages/contracts/assistant";
import { mergePreferences, preferencesSchema } from "@/packages/contracts/preferences";
import { stayDecisionSchema } from "@/packages/contracts/stay";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";

const DECISION_IMPACT: Record<string, string> = {
  destination: "This resets the plan — places, stay area, transport and budget all refresh for the new destination.",
  stay: "Distances on place cards now measure from this hotel; the itinerary anchors here.",
  stay_area: "This changes day-by-day travel time and local transit cost.",
  transport: "This changes daily travel time and your transport budget.",
};

export async function POST(request: Request) {
  try {
    const parsed = proposedCommandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid command" }, { status: 400 });
    const command = parsed.data;
    const { supabase } = await requireTripMember(command.tripId, { role: "editor" });

    if (command.type === "update_preferences") {
      const preferences = preferencesSchema.parse(command.preferences);
      const existing = await supabase.from("trip_preferences").select("data").eq("trip_id", command.tripId).maybeSingle();
      if (existing.error) throw existing.error;
      const merged = preferencesSchema.parse(mergePreferences((existing.data?.data ?? {}) as Record<string, unknown>, preferences));
      const result = await supabase.from("trip_preferences").upsert({ trip_id: command.tripId, data: merged }).select("data,updated_at").single();
      if (result.error) return NextResponse.json({ error: "Command failed" }, { status: 503 });
      const changeImpact = "budget" in preferences ? "Budget updated — cost estimates will use the new figure." : undefined;
      return NextResponse.json({ result: { type: command.type, memory: result.data }, changeImpact });
    }
    if (command.type === "add_itinerary_item") {
      const result = await supabase.from("trip_itinerary_items").upsert({ trip_id: command.tripId, title: command.title, day_index: command.dayIndex, metadata: { source: "assistant-proposal" } }, { onConflict: "trip_id,title" }).select("id,title,day_index,metadata,created_at").single();
      if (result.error) throw result.error;
      return NextResponse.json({ result: { type: command.type, item: result.data } });
    }
    if (command.type === "save_place") {
      const place = await createPlaceRepository(supabase, createSupabaseAdminClient()).save(command.tripId, command.place);
      return NextResponse.json({ result: { type: command.type, place } });
    }
    if (command.kind === "stay") stayDecisionSchema.parse(command.value);
    const decision = { trip_id: command.tripId, kind: command.kind, value: command.value, source: "user", ...(command.idempotencyKey ? { idempotency_key: command.idempotencyKey } : {}) };
    const result = command.idempotencyKey
      ? await supabase.from("trip_decisions").upsert(decision, { onConflict: "trip_id,idempotency_key" }).select("id,kind,value,source,created_at").single()
      : await supabase.from("trip_decisions").insert(decision).select("id,kind,value,source,created_at").single();
    if (result.error) throw result.error;
    return NextResponse.json({ result: { type: command.type, decision: result.data }, changeImpact: DECISION_IMPACT[command.kind] });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid command data" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Command failed");
  }
}
