import { describe, expect, it } from "vitest";
import { realtimeFilterForTable, reconnectDelayMs, TABLE_TO_CHANGE } from "../../lib/client/trip-realtime";

describe("realtimeFilterForTable", () => {
  it("uses the trip primary key for the trips table", () => {
    expect(realtimeFilterForTable("trips", "trip-1")).toBe("id=eq.trip-1");
  });

  it("uses denormalized trip_id for trip-scoped child tables", () => {
    expect(realtimeFilterForTable("conversation_messages", "trip-1")).toBe("trip_id=eq.trip-1");
    expect(realtimeFilterForTable("trip_places", "trip-1")).toBe("trip_id=eq.trip-1");
  });
});

describe("reconnectDelayMs", () => {
  // Live-testing finding: a dropped realtime channel was never retried at all — a laptop
  // sleeping or a WiFi handoff silently killed live collaboration for the rest of the tab's
  // session, with nothing but a console.error to show for it. Backoff, capped, never gives up.
  it("doubles each attempt starting at 1s", () => {
    expect(reconnectDelayMs(0)).toBe(1_000);
    expect(reconnectDelayMs(1)).toBe(2_000);
    expect(reconnectDelayMs(2)).toBe(4_000);
    expect(reconnectDelayMs(3)).toBe(8_000);
  });

  it("caps at 30s instead of growing unbounded", () => {
    expect(reconnectDelayMs(5)).toBe(30_000);
    expect(reconnectDelayMs(20)).toBe(30_000);
    expect(reconnectDelayMs(1000)).toBe(30_000);
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
      bookings: "decision",
      trip_members: "members",
    });
  });
});
