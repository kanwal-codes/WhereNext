import { describe, expect, it } from "vitest";
import { loadTripsIndex } from "@/lib/server/trips-index";

describe("loadTripsIndex ownership", () => {
  it("marks only the trips the user owns, so everyone else sees Leave rather than Delete", async () => {
    const rows = [
      { id: "t1", name: "Mine", owner_id: "me", hero_photo_name: "x" },
      { id: "t2", name: "Shared with me", owner_id: "someone-else", hero_photo_name: "x" },
    ];
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: "me", email: "me@example.com", user_metadata: {} } } }) },
      from: (table: string) => ({
        select: () =>
          table === "trips"
            ? { order: async () => ({ data: rows, error: null }) }
            : { in: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) },
      }),
    };
    const data = await loadTripsIndex(supabase as never);
    expect(data?.trips.map((t) => [t.id, t.is_owner])).toEqual([["t1", true], ["t2", false]]);
    expect(data?.trips.some((t) => "owner_id" in t)).toBe(false);
  });
});
