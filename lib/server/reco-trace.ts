import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/server/logger";

/** One `reco_events` row, minus the columns the insert fills in (`id`, `trip_id`, `created_at`). */
export type RecoEvent = {
  anchor_kind: "place" | "event";
  anchor_id: string;
  vibe: string;
  lane_id: string;
  action: "impression" | "click";
  item_kind: "place" | "event";
  item_id: string;
  position?: number;
};

/**
 * Fire-and-forget batch insert of recommendation impressions / clicks. Analytics only —
 * every failure path is logged at debug and swallowed so it can never affect a response.
 * Mirrors `recordAiTurn`.
 */
export function recordRecoEvents(supabase: SupabaseClient, tripId: string, events: RecoEvent[]): void {
  if (events.length === 0) return;
  try {
    void supabase
      .from("reco_events")
      .insert(events.map((event) => ({ trip_id: tripId, ...event })))
      .then(
        ({ error }) => {
          if (error) logger.debug({ err: error }, "reco events insert failed");
        },
        () => undefined,
      );
  } catch (error) {
    logger.debug({ err: error }, "reco events insert failed");
  }
}
