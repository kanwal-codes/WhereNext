import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTripMemory, loadTripContext } from "@/lib/application/trip-context";

/** Minimal thenable query builder: every chained call returns itself; awaiting resolves the rows. */
function table(rows: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "limit"]) builder[method] = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: rows, error: null });
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return builder;
}

const stay = {
  provider: "liteapi", hotelId: "h1", hotelName: "Hotel Alfama", roomName: "Deluxe", board: "Breakfast", refundable: true,
  checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, nightlyAmount: 120, totalAmount: 360, currency: "EUR",
  latitude: 38.71, longitude: -9.13, address: "Alfama", thumbnail: null,
};

const supabase = {
  from: (name: string) =>
    table(
      name === "trips" ? { name: "Lisbon week", destination: "Lisbon", origin: null, duration_days: 4, travelers: 2 }
      : name === "trip_preferences" ? { data: { budget: 150 } }
      : name === "trip_itinerary_items" ? [{ title: "Belém Tower", day_index: 1, metadata: { locked: true, latitude: 38.69, longitude: -9.21 } }]
      : name === "trip_places" ? []
      : name === "trip_decisions" ? [{ kind: "stay", value: stay, source: "user", created_at: "2026-09-02T00:00:00Z" }]
      : [],
    ),
} as unknown as SupabaseClient;

describe("loadTripContext", () => {
  it("includes canonical trip identity even without recent conversation", async () => {
    const context = await loadTripContext(supabase, "trip-1");
    context.trip = { name: "Montreal trip", destination: "Montreal", origin: "Toronto", duration_days: 5, travelers: 3, start_date: null, end_date: null };
    const memory = formatTripMemory(context);
    expect(memory).toContain("destination: Montreal");
    expect(memory).toContain("origin: Toronto");
    expect(memory).toContain("duration: 5 days");
    expect(memory).toContain("travellers: 3");
    expect(memory).toContain("dates: undecided");
  });
  it("puts the locked stay first among the anchors and exposes it as lockedStay", async () => {
    const context = await loadTripContext(supabase, "trip-1");
    expect(context.lockedStay).toMatchObject({ hotelName: "Hotel Alfama", roomName: "Deluxe" });
    expect(context.lockedPlaces.map((p) => p.title)).toEqual(["Hotel Alfama", "Belém Tower"]);
    expect(formatTripMemory(context)).toContain("Stay: Hotel Alfama, Deluxe, 2026-10-15→2026-10-18, 360 EUR.");
  });

  it("keeps internal review bookkeeping decisions out of the assistant's memory line", () => {
    const context = {
      trip: null,
      preferences: {},
      itinerary: [],
      lockedTitles: [],
      places: [],
      decisions: [
        { kind: "review_notified", value: { ids: ["missing-hotel"] }, source: "assistant", created_at: "t" },
        { kind: "review_dismissed", value: { id: "missing-hotel" }, source: "user", created_at: "t" },
        { kind: "transport", value: "Metro pass", source: "user", created_at: "t" },
      ],
    };
    const memory = formatTripMemory(context);
    expect(memory).not.toContain("review_notified");
    expect(memory).not.toContain("review_dismissed");
    expect(memory).toContain("transport: Metro pass");
  });
});
