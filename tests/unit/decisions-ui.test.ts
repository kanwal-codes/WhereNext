import { describe, expect, it } from "vitest";
import { certaintyFor, decisionSummary, isDisplayableDecision } from "@/lib/decisions-ui";

describe("decisionSummary", () => {
  it("renders a locked stay as one line", () => {
    const value = { provider: "liteapi", hotelId: "h1", hotelName: "Torel Palace", roomName: "Deluxe", board: null, refundable: true, checkin: "2026-10-15", checkout: "2026-10-18", nights: 3, nightlyAmount: 230, totalAmount: 690, currency: "EUR", latitude: null, longitude: null, address: null, thumbnail: null };
    expect(decisionSummary("stay", value)).toMatch(/^Torel Palace · Deluxe · .+ – .+ · 690 EUR$/);
  });

  it("prefers a naming field, then scalars, and never shows raw braces for simple objects", () => {
    expect(decisionSummary("destination", { destination: "Lisbon", country: "PT" })).toBe("Lisbon");
    expect(decisionSummary("budget", { daily: 120, currency: "EUR" })).toBe("120 · EUR");
    expect(decisionSummary("transport", "metro pass")).toBe("metro pass");
    expect(decisionSummary("x", {})).toBe("{}");
  });

  it("shows the human summary for a rideshare/car-rental transport decision, not the raw mode", () => {
    expect(decisionSummary("transport", { mode: "rideshare", name: "Rideshare (est.), Uber/Lyft" })).toBe("Rideshare (est.), Uber/Lyft");
    expect(decisionSummary("transport", { mode: "car_rental", name: "Avis – JFK (car rental)", address: "JFK Airport" })).toBe("Avis – JFK (car rental)");
  });
});

describe("isDisplayableDecision", () => {
  it("hides leg_transport — it has its own picker in RouteTimeline, not a generic decisions row", () => {
    expect(isDisplayableDecision("leg_transport")).toBe(false);
  });

  it("shows a plain decision kind with no dedicated UI", () => {
    expect(isDisplayableDecision("destination")).toBe(true);
  });
});

describe("certaintyFor", () => {
  it("maps decision sources to badge certainty", () => {
    expect(certaintyFor("user")).toBe("confirmed");
    expect(certaintyFor("assistant")).toBe("suggested");
    expect(certaintyFor(undefined)).toBe("undecided");
  });
});
