import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { mergePreferences, preferencesSchema } from "@/packages/contracts/preferences";
import { suggestionActionSchema, suggestionValueSchema, type SuggestionKey } from "@/packages/contracts/suggestion";
import { tripDurationDays } from "@/features/trip/domain/trip";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

const splitList = (value: string) => value.split(/[,·;/]| and /i).map((s) => s.trim()).filter(Boolean).slice(0, 20);

/** Which preference field (if any) a suggestion key promotes into. */
const PREF_FIELD: Partial<Record<SuggestionKey, keyof z.infer<typeof preferencesSchema>>> = {
  budget: "budget",
  group: "groupType",
  pace: "pace",
  occasion: "occasion",
  dates: "dates",
  arrival: "arrival",
  getting_around: "transport",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = suggestionActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { key, action } = parsed.data;

    const row = await supabase
      .from("trip_decisions")
      .select("id,value")
      .eq("trip_id", tripId)
      .eq("idempotency_key", `sugg:${key}`)
      .maybeSingle();
    if (row.error) throw row.error;
    if (!row.data) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });

    if (action === "confirm") {
      const suggestion = suggestionValueSchema.parse(row.data.value);
      const prefField = PREF_FIELD[key];
      // A dates suggestion with a resolved window also sets the real trip columns.
      if (key === "dates" && suggestion.startDate && suggestion.endDate) {
        const derived = tripDurationDays(suggestion.startDate, suggestion.endDate);
        const write = await supabase
          .from("trips")
          .update({ start_date: suggestion.startDate, end_date: suggestion.endDate, ...(derived ? { duration_days: derived } : {}) })
          .eq("id", tripId);
        if (write.error) throw write.error;
      }
      if (key === "interests") {
        const existing = await supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle();
        if (existing.error) throw existing.error;
        const merged = preferencesSchema.parse(
          mergePreferences((existing.data?.data ?? {}) as Record<string, unknown>, { interests: splitList(suggestion.display) }),
        );
        const write = await supabase.from("trip_preferences").upsert({ trip_id: tripId, data: merged });
        if (write.error) throw write.error;
      } else if (prefField) {
        const existing = await supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle();
        if (existing.error) throw existing.error;
        const raw = suggestion.display;
        const value = key === "budget" && raw && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
        const merged = preferencesSchema.parse(mergePreferences((existing.data?.data ?? {}) as Record<string, unknown>, { [prefField]: value }));
        const write = await supabase.from("trip_preferences").upsert({ trip_id: tripId, data: merged });
        if (write.error) throw write.error;
      } else if (key === "base_area") {
        const write = await supabase
          .from("trip_decisions")
          .upsert({ trip_id: tripId, kind: "stay_area", value: { area: suggestion.display }, source: "user", idempotency_key: "stay_area" }, { onConflict: "trip_id,idempotency_key" });
        if (write.error) throw write.error;
      }
    }

    const remove = await supabase.from("trip_decisions").delete().eq("id", row.data.id);
    if (remove.error) throw remove.error;
    invalidateWorkspace(tripId);
    return NextResponse.json({ ok: true, key, action });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid suggestion" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Could not update that suggestion");
  }
}
