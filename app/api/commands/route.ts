import { NextResponse } from "next/server";
import { z } from "zod";
import { proposedCommandSchema } from "@/packages/contracts/assistant";
import { mergePreferences, preferenceUpdateSchema, preferencesSchema } from "@/packages/contracts/preferences";
import { stayDecisionSchema } from "@/packages/contracts/stay";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPlaceRepository } from "@/features/places/infrastructure/placeRepository";
import { geocodeStop } from "@/lib/server/geocode-stop";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

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
      const preferences = preferenceUpdateSchema.parse(command.preferences);
      const existing = await supabase.from("trip_preferences").select("data").eq("trip_id", command.tripId).maybeSingle();
      if (existing.error) throw existing.error;
      const merged = preferencesSchema.parse(mergePreferences((existing.data?.data ?? {}) as Record<string, unknown>, preferences));
      const result = await supabase.from("trip_preferences").upsert({ trip_id: command.tripId, data: merged }).select("data,updated_at").single();
      if (result.error) return NextResponse.json({ error: "Command failed" }, { status: 503 });
      invalidateWorkspace(command.tripId);
      const changeImpact = "budget" in preferences ? "Budget updated — cost estimates will use the new figure." : undefined;
      return NextResponse.json({ result: { type: command.type, memory: result.data }, changeImpact });
    }
    if (command.type === "add_itinerary_item") {
      const metadata: Record<string, unknown> = { source: "assistant-proposal" };
      if (command.providerId) metadata.provider_id = command.providerId;
      if (command.time) metadata.time = command.time;
      const existing = await supabase
        .from("trip_itinerary_items")
        .select("id,title,day_index,metadata,created_at")
        .eq("trip_id", command.tripId)
        .eq("title", command.title)
        .is("removed_at", null)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return NextResponse.json({ result: { type: command.type, item: existing.data, alreadyExists: true } });
      // A caller that already knows exactly where this is (e.g. an event's own venue
      // coordinates) skips the geocode guess entirely — more accurate and one less API call.
      const coords = command.latitude != null && command.longitude != null
        ? { latitude: command.latitude, longitude: command.longitude }
        : await geocodeStop(supabase, command.tripId, command.title, command.providerId);
      if (coords) Object.assign(metadata, coords);
      // removed_at must be explicit: upsert only touches columns present in the payload, so a
      // title reused after being soft-deleted would otherwise resurrect with the old removed_at
      // still set and stay invisible to every listing that filters on it.
      const result = await supabase.from("trip_itinerary_items").upsert({ trip_id: command.tripId, title: command.title, day_index: command.dayIndex, metadata, removed_at: null }, { onConflict: "trip_id,title" }).select("id,title,day_index,metadata,created_at").single();
      if (result.error) throw result.error;
      invalidateWorkspace(command.tripId);
      return NextResponse.json({ result: { type: command.type, item: result.data } });
    }
    if (command.type === "save_place") {
      const place = await createPlaceRepository(supabase, createSupabaseAdminClient()).save(command.tripId, command.place);
      invalidateWorkspace(command.tripId);
      return NextResponse.json({ result: { type: command.type, place } });
    }
    if (command.kind === "stay") stayDecisionSchema.parse(command.value);
    const decision = { trip_id: command.tripId, kind: command.kind, value: command.value, source: "user", ...(command.idempotencyKey ? { idempotency_key: command.idempotencyKey } : {}) };
    const result = command.idempotencyKey
      ? await supabase.from("trip_decisions").upsert(decision, { onConflict: "trip_id,idempotency_key" }).select("id,kind,value,source,created_at").single()
      : await supabase.from("trip_decisions").insert(decision).select("id,kind,value,source,created_at").single();
    if (result.error) throw result.error;
    invalidateWorkspace(command.tripId);
    return NextResponse.json({ result: { type: command.type, decision: result.data }, changeImpact: DECISION_IMPACT[command.kind] });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid command data" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Command failed");
  }
}
