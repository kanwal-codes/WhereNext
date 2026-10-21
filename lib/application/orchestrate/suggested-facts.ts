import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripContext } from "@/lib/application/trip-context";
import type { ResolvedTurn } from "@/lib/application/turn-resolver";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

/** True when this suggestion key already has a confirmed value on the trip. */
export function factAlreadyConfirmed(key: string, ctx: TripContext): boolean {
  const p = ctx.preferences;
  const hasList = (v: unknown) => Array.isArray(v) && v.length > 0;
  switch (key) {
    case "budget": return p.budget !== undefined && p.budget !== "";
    case "group": return typeof p.groupType === "string" && p.groupType !== "";
    case "pace": return typeof p.pace === "string" && p.pace !== "";
    case "interests": return hasList(p.interests) || hasList(p.likes);
    case "dietary": return hasList(p.dietaryNeeds);
    case "occasion": return typeof p.occasion === "string" && p.occasion !== "";
    case "dates": return Boolean(ctx.trip?.start_date && ctx.trip?.end_date) || (typeof p.dates === "string" && p.dates !== "");
    case "arrival": return typeof p.arrival === "string" && p.arrival !== "";
    case "getting_around": return (typeof p.transport === "string" && p.transport !== "") || ctx.decisions.some((d) => d.kind === "transport");
    case "base_area": return ctx.decisions.some((d) => d.kind === "stay_area");
    case "destination": return Boolean(ctx.trip?.destination);
    case "travelers": return typeof ctx.trip?.travelers === "number" && ctx.trip.travelers > 0;
    case "trip_length": return typeof ctx.trip?.duration_days === "number" && ctx.trip.duration_days > 0;
    default: return false;
  }
}

/** The pending-suggestion rows for the facts the resolver inferred and the trip has not confirmed yet (one live row per key). */
export function suggestionRows(tripId: string, facts: ResolvedTurn["suggestedFacts"], ctx: TripContext) {
  return (facts ?? [])
    .filter((fact) => !factAlreadyConfirmed(fact.key, ctx))
    .map((fact) => ({
      trip_id: tripId,
      kind: "suggestion",
      value: {
        key: fact.key,
        display: fact.display,
        rationale: fact.rationale,
        ...(fact.key === "dates" && fact.startDate && fact.endDate ? { startDate: fact.startDate, endDate: fact.endDate } : {}),
      },
      source: "assistant",
      idempotency_key: `sugg:${fact.key}`,
    }));
}

/** Stores them for the trip-context panel to confirm. Best effort: a missed suggestion is not worth failing the turn. */
export async function persistSuggestedFacts(supabase: SupabaseClient, tripId: string, facts: ResolvedTurn["suggestedFacts"], ctx: TripContext): Promise<void> {
  const rows = suggestionRows(tripId, facts, ctx);
  if (rows.length === 0) return;
  try {
    const result = await supabase.from("trip_decisions").upsert(rows, { onConflict: "trip_id,idempotency_key" });
    if (!result.error) invalidateWorkspace(tripId);
  } catch {
    // A missed suggestion is not worth failing the turn (or a test with a partial supabase mock).
  }
}
