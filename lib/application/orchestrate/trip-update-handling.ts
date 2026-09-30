import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { loadTripContext, serializeTripContext, type TripContext } from "@/lib/application/trip-context";
import type { ResolvedTurn } from "@/lib/application/turn-resolver";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";
import { buildTripRowUpdate, dropUnrequestedClears, withExplicitDestination, type ProposedTripUpdate } from "@/lib/application/trip-update";

/**
 * Applying `proposedTripUpdate` / `proposedProfileUpdate`, and the change receipt shown for the
 * former. Extracted (Phase 1.3.1, docs/overhaul/roadmap/phase-1-structural-refactor.md) out of
 * `runAssistantTurn`, verbatim — no logic changes.
 */

type TripChange = { field: string; label: string; from: string | null; to: string | null; undoPrompt?: string };

/** Diffs an applied `ProposedTripUpdate` against the trip row as it was before, for a visible
 *  "Destination updated: X -> Y" receipt with an Undo that just re-sends the reverse statement
 *  through the same explicit-change pipeline — no separate undo command needed. Only fields that
 *  actually changed get an entry; a field the resolver "corrected" to its current value produces
 *  no noisy no-op receipt line. */
function buildTripChangeReceipt(before: TripContext["trip"], update: ProposedTripUpdate): TripChange[] {
  const changes: TripChange[] = [];
  if (update.name !== undefined && update.name !== before?.name) {
    changes.push({ field: "name", label: "Trip name", from: before?.name ?? null, to: update.name });
  }
  if (update.destination !== undefined && update.destination !== (before?.destination ?? null)) {
    const from = before?.destination ?? null;
    changes.push({ field: "destination", label: "Destination", from, to: update.destination, ...(from ? { undoPrompt: `Actually, change the destination back to ${from}.` } : {}) });
  }
  if (update.origin !== undefined && update.origin !== (before?.origin ?? null)) {
    const from = before?.origin ?? null;
    changes.push({ field: "origin", label: "Origin", from, to: update.origin, ...(from ? { undoPrompt: `Actually, change where we're flying from back to ${from}.` } : {}) });
  }
  if (update.startDate !== undefined || update.endDate !== undefined) {
    const fromStart = before?.start_date ?? null;
    const fromEnd = before?.end_date ?? null;
    const toStart = update.startDate !== undefined ? update.startDate : fromStart;
    const toEnd = update.endDate !== undefined ? update.endDate : fromEnd;
    if (toStart !== fromStart || toEnd !== fromEnd) {
      const label = (s: string | null, e: string | null) => (s && e ? `${s} to ${e}` : s ? `starting ${s}` : "undecided");
      changes.push({
        field: "dates", label: "Dates", from: label(fromStart, fromEnd), to: label(toStart, toEnd),
        ...(fromStart && fromEnd ? { undoPrompt: `Actually, set the dates back to ${fromStart} through ${fromEnd}.` } : {}),
      });
    }
  }
  if (update.durationDays !== undefined && update.durationDays !== (before?.duration_days ?? null)) {
    const from = before?.duration_days ?? null;
    changes.push({
      field: "durationDays", label: "Trip length", from: from ? `${from} days` : null, to: update.durationDays ? `${update.durationDays} days` : null,
      ...(from ? { undoPrompt: `Actually, make it ${from} days again.` } : {}),
    });
  }
  if (update.travelerCount !== undefined && update.travelerCount !== (before?.travelers ?? null)) {
    const from = before?.travelers ?? null;
    changes.push({
      field: "travelers", label: "Travelers", from: from ? String(from) : null, to: update.travelerCount ? String(update.travelerCount) : null,
      ...(from ? { undoPrompt: `Actually, we're ${from} travelers, not ${update.travelerCount}.` } : {}),
    });
  }
  return changes;
}

export type TripUpdateResult = {
  tripCtx: TripContext;
  destination: string;
  context: string;
  tripSummary: string;
  tripUpdateReceipt: AssistantBlock | null;
};

/**
 * Persist explicit core trip facts while this request is still active. This keeps the
 * canonical trip row, the cached workspace, and the assistant's same-turn retrieval in sync.
 * Applied immediately (no blocking confirm dialog) — but visibly, via the returned receipt
 * block, and reversibly, via its one-tap Undo.
 */
export async function applyTripUpdate(params: {
  supabase: SupabaseClient;
  tripId: string;
  tripCtx: TripContext;
  prompt: string;
  resolved: ResolvedTurn;
  tripSummary: string;
  deriveTripSummary: (ctx: TripContext) => string;
}): Promise<TripUpdateResult> {
  const { supabase, tripId, prompt, resolved, deriveTripSummary } = params;
  let tripCtx = params.tripCtx;
  let tripSummary = params.tripSummary;
  let destination = tripCtx.trip?.destination ?? "the trip destination";
  let context = serializeTripContext(tripCtx);
  let tripUpdateReceipt: AssistantBlock | null = null;

  const proposed = withExplicitDestination(resolved.proposedTripUpdate, prompt, resolved.locationFocus);
  const tripUpdate = proposed && dropUnrequestedClears(tripCtx.trip, proposed, prompt);
  if (tripUpdate && Object.keys(tripUpdate).length > 0) {
    const update = buildTripRowUpdate(tripCtx.trip, tripUpdate);
    if (Object.keys(update).length > 0) {
      const before = tripCtx.trip;
      // Optimistic concurrency: only apply if the trip row hasn't changed since this turn loaded
      // it a moment ago. Two members correcting different facts within the same window is a real
      // risk in a shared group trip (personal chat has only one writer, but group @Roam does
      // not) — without this check, a blind read-modify-write means whichever write lands last
      // silently overwrites the other, and the "losing" member's turn still shows their own
      // change as if it had stuck. Requires `trips.updated_at` to be trigger-maintained
      // (migration 0030) — a plain default-on-insert column never changes on its own.
      const result = await supabase.from("trips").update(update).eq("id", tripId).eq("updated_at", before?.updated_at ?? "").select("id").maybeSingle();
      if (result.error) throw result.error;
      if (result.data) {
        invalidateWorkspace(tripId);
        tripCtx = await loadTripContext(supabase, tripId);
        destination = tripCtx.trip?.destination ?? "the trip destination";
        context = serializeTripContext(tripCtx);
        tripSummary = deriveTripSummary(tripCtx);
        const changes = buildTripChangeReceipt(before, tripUpdate);
        if (changes.length > 0) tripUpdateReceipt = { type: "trip_update", changes };
      } else {
        // Someone else changed the trip since this turn loaded it. Reload the current truth
        // rather than blindly overwrite their concurrent change with what this turn saw a moment
        // ago — this turn's own proposed change is simply dropped; the user can just repeat it
        // once they see the trip's actual current state, which is simpler and safer than trying
        // to auto-merge two members' simultaneous edits.
        tripCtx = await loadTripContext(supabase, tripId);
        destination = tripCtx.trip?.destination ?? "the trip destination";
        context = serializeTripContext(tripCtx);
        tripSummary = deriveTripSummary(tripCtx);
      }
    }
  }
  return { tripCtx, destination, context, tripSummary, tripUpdateReceipt };
}

/** The `update_preferences` command surfaced for the UI to confirm — group chat disables this
 *  entirely (`allowPreferenceLearning` false); this file never writes the profile itself, just
 *  packages what RESOLVE proposed. */
export function buildProposedProfileCommand(
  tripId: string,
  resolved: ResolvedTurn,
  allowPreferenceLearning: boolean,
): { type: "update_preferences"; tripId: string; preferences: NonNullable<ResolvedTurn["proposedProfileUpdate"]> } | undefined {
  return allowPreferenceLearning && resolved.proposedProfileUpdate && Object.keys(resolved.proposedProfileUpdate).length > 0
    ? { type: "update_preferences" as const, tripId, preferences: resolved.proposedProfileUpdate }
    : undefined;
}
