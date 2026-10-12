import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { committedLine, formatTripMemory, loadTripContext, type ContextReservation } from "@/lib/application/trip-context";
import { buildTripSummary } from "@/lib/application/trip-summary";
import { lodgingGaps, outsideTripDates } from "@/lib/trip-reservations";

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

describe("bookings in Roam's context", () => {
  const r = (extra: Partial<ContextReservation>): ContextReservation => ({ kind: "stay", title: "Hotel", startsOn: null, endsOn: null, startTime: null, endTime: null, place: null, toPlace: null, amount: null, currency: null, amountBasis: "total", cancelled: false, ...extra });
  const trip = { name: "Europe", destination: "Rome, Paris", origin: "Toronto", duration_days: 8, travelers: 5, start_date: "2027-06-05", end_date: "2027-06-12" };
  const base = { preferences: {}, itinerary: [], places: [], decisions: [], lockedTitles: [] };

  it("tells the model what is already booked, without codes or notes, and which nights have no stay", () => {
    const memory = formatTripMemory({ ...base, trip, reservations: [
      r({ title: "Hotel Colosseo", startsOn: "2027-06-09", endsOn: "2027-06-12", amount: 1184, currency: "EUR" }),
      r({ kind: "flight", title: "JFK to FCO", startsOn: "2027-06-08", startTime: "19:40", endTime: "09:10", place: "JFK", toPlace: "FCO" }),
    ] });
    expect(memory).toContain("Already booked");
    expect(memory).toContain("flight: JFK to FCO (JFK → FCO), 2027-06-08 19:40–09:10");
    expect(memory).toContain("Stays: already booked — Hotel Colosseo (2027-06-09 to 2027-06-12)");
    expect(memory).toContain("Nights with no stay booked yet: 2027-06-05 to 2027-06-09 (4 nights)");
    expect(memory).not.toContain("Stay: not locked yet");
  });
  it("keeps cancelled bookings out of the booked list and flags ones outside the dates", () => {
    const memory = formatTripMemory({ ...base, trip, reservations: [r({ title: "Old hotel", startsOn: "2027-06-05", endsOn: "2027-06-12", cancelled: true }), r({ kind: "activity", title: "Early tour", startsOn: "2027-06-01" })] });
    expect(memory).toContain("Cancelled bookings (no longer happening): Old hotel");
    expect(memory).toContain("1 booking is dated outside the trip's current dates");
    expect(memory).not.toMatch(/Already booked and paid by the group[^.]*Old hotel/);
  });
  it("says nothing about bookings when there are none", () => {
    expect(formatTripMemory({ ...base, trip, reservations: [] })).toContain("Stay: not locked yet.");
  });
  it("the trip summary counts booked stays instead of 'Not chosen yet'", () => {
    const ctx = { ...base, trip: { ...trip, updated_at: null }, lockedStay: null, accommodationAnchor: null, lockedPlaces: [], reservations: [r({ title: "Hotel Colosseo" }), r({ kind: "flight", title: "AC 8719" })] };
    const card = buildTripSummary(ctx);
    expect(card?.rows.find((row) => row.label === "Staying at")?.value).toBe("Hotel Colosseo");
    expect(card?.rows.find((row) => row.label === "Booked")?.value).toContain("2 bookings");
  });
});

describe("lodgingGaps and outsideTripDates", () => {
  const stay = (startsOn: string, endsOn: string | null, status: "confirmed" | "cancelled" = "confirmed") => ({ kind: "stay" as const, startsOn, endsOn, status });
  it("lists the unslept nights as runs, treats the last day as a flight home, and ignores cancelled stays", () => {
    expect(lodgingGaps([stay("2027-06-05", "2027-06-08"), stay("2027-06-10", "2027-06-12")], "2027-06-05", "2027-06-12")).toEqual([{ from: "2027-06-08", to: "2027-06-10", nights: 2 }]);
    expect(lodgingGaps([stay("2027-06-05", "2027-06-12", "cancelled")], "2027-06-05", "2027-06-07")).toEqual([{ from: "2027-06-05", to: "2027-06-07", nights: 2 }]);
    expect(lodgingGaps([], null, null)).toEqual([]);
  });
  it("counts the night of an overnight flight as slept", () => {
    const rows = [stay("2027-06-05", "2027-06-08"), { kind: "flight" as const, startsOn: "2027-06-08", endsOn: "2027-06-09", status: "confirmed" as const }, stay("2027-06-09", "2027-06-12")];
    expect(lodgingGaps(rows, "2027-06-05", "2027-06-12")).toEqual([]);
    expect(lodgingGaps([{ kind: "flight" as const, startsOn: "2027-06-08", endsOn: null, status: "confirmed" as const }], "2027-06-08", "2027-06-09")).toEqual([{ from: "2027-06-08", to: "2027-06-09", nights: 1 }]);
  });
  it("flags bookings before the start or after the end, never cancelled ones", () => {
    const rows = [{ startsOn: "2027-06-01", status: "confirmed" as const }, { startsOn: "2027-06-20", status: "cancelled" as const }, { startsOn: "2027-06-09", status: "confirmed" as const }];
    expect(outsideTripDates(rows, "2027-06-05", "2027-06-12")).toHaveLength(1);
  });
});

describe("committedLine", () => {
  it("states the converted totals and tells the model not to do its own sums", () => {
    const line = committedLine({ currency: "CAD", travellers: 5, lines: [{ currency: "EUR", total: 4613, count: 9 }, { currency: "GBP", total: 2885, count: 3 }], convertedTotal: 24646.56, perPerson: 4929.31, unconverted: [{ currency: "XXX", total: 10 }] });
    expect(line).toContain("CA$24,647");
    expect(line).toContain("per person");
    expect(line).toContain("9 bookings");
    expect(line).toContain("No rate is listed for");
    expect(line).toContain("do not add up or convert");
  });
});

describe("formatTripMemory budget", () => {
  it("says what a plain number budget is: per person per day, in the trip's currency", () => {
    const text = formatTripMemory({ preferences: { budget: 200 }, itinerary: [], places: [], decisions: [], lockedTitles: [] });
    expect(text).toContain("budget: 200 CAD per person per day");
  });
});
