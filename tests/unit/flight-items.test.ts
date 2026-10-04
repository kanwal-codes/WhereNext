import { describe, expect, it } from "vitest";
import { toFlightItem } from "../../lib/application/flight-items";

describe("toFlightItem", () => {
  it("applies the card contract's limits and drops provider-only fields", () => {
    const item = toFlightItem({
      id: "o".repeat(300), airline: "A".repeat(120), priceAmount: "280.22", priceCurrency: "USD", durationMinutes: 605, stops: 0,
      departAt: "2026-11-15T10:50:00", arriveAt: "2026-11-16T02:55:00", originAirport: "YKF", destinationAirport: "ZAG",
      fareConditions: ["a", "b", "c", "d", "e"], passengerIds: ["pas_1"],
    });
    expect(item.id).toHaveLength(240);
    expect(item.airline).toHaveLength(80);
    expect(item.fareConditions).toHaveLength(4);
    expect(item).toMatchObject({ price: "280.22", currency: "USD", originAirport: "YKF" });
    expect(item).not.toHaveProperty("passengerIds");
  });
});
