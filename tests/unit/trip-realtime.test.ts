import { describe, expect, it } from "vitest";
import { realtimeFilterForTable, TABLE_TO_CHANGE } from "../../lib/client/trip-realtime";

describe("realtimeFilterForTable", () => {
  it("uses the trip primary key for the trips table", () => {
    expect(realtimeFilterForTable("trips", "trip-1")).toBe("id=eq.trip-1");
  });

  it("uses denormalized trip_id for trip-scoped child tables", () => {
    expect(realtimeFilterForTable("conversation_messages", "trip-1")).toBe("trip_id=eq.trip-1");
    expect(realtimeFilterForTable("trip_places", "trip-1")).toBe("trip_id=eq.trip-1");
  });
});

describe("TABLE_TO_CHANGE", () => {
  it("subscribes every mutable trip-scoped table so a collaborator's edit reaches other devices", () => {
    // Each of these has its own mutation route + its own `announceWorkspaceChange` call for the
    // LOCAL editor; if a table is missing here, a REMOTE collaborator's edit to it never
    // realtime-propagates — silently stale until a manual reload. trip_essentials was added
    // this way and initially missed here.
    expect(TABLE_TO_CHANGE).toMatchObject({
      trips: "preferences",
      trip_itinerary_items: "itinerary",
      trip_places: "places",
      trip_preferences: "preferences",
      trip_decisions: "decision",
      trip_essentials: "essentials",
      conversation_messages: "conversation",
    });
  });
});
