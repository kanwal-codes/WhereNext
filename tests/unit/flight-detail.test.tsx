import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlightDetail } from "../../features/conversation/ui/panels/FlightDetail";

const route = { origin: "Toronto", destination: "Ireland", retrievedAt: "t", dateNote: "Departing 2026-11-15" };
const base = { airline: "Air Canada · United", price: "605.00", currency: "CAD", durationMinutes: 970, departAt: "2026-11-15T10:20:00", arriveAt: "2026-11-16T07:30:00", originAirport: "YTZ", destinationAirport: "DUB" };
const render = (flight: Parameters<typeof FlightDetail>[0]["flight"]) => renderToStaticMarkup(<FlightDetail flight={flight} route={route} />);

describe("FlightDetail journey", () => {
  it("offers the journey for a connecting flight that carries its legs", () => {
    const html = render({ ...base, stops: 1, layoverAirports: ["ZRH"], legs: [
      { from: "YYZ", departAt: "2026-11-15T20:25:00", to: "ZRH", arriveAt: "2026-11-16T09:35:00", minutes: 430, layoverMinutes: 130 },
      { from: "ZRH", departAt: "2026-11-16T11:45:00", to: "DUB", arriveAt: "2026-11-16T13:05:00", minutes: 140 },
    ] });
    expect(html).toContain("See the journey");
    expect(html).toContain("2 flights · 2h 10m of layover");
  });

  it("still offers a plainer journey for a card saved before legs were kept, from its airports and flight numbers", () => {
    const html = render({ ...base, stops: 2, layoverAirports: ["YOW", "EWR"], flightNumbers: ["AC 7864", "UA 3620", "UA 23"] });
    expect(html).toContain("See the journey");
    expect(html).toContain("3 flights");
  });

  it("has no journey for a nonstop flight, or when the stops cannot be told apart", () => {
    expect(render({ ...base, stops: 0 })).not.toContain("See the journey");
    expect(render({ ...base, stops: 2, layoverAirports: ["YOW"] })).not.toContain("See the journey");
  });
});

describe("AirlineMark", () => {
  it("overlaps one logo per airline when several fly the journey, and keeps one logo otherwise", async () => {
    const { AirlineMark } = await import("../../features/conversation/ui/panels/OtherFlights");
    const leg = (airline: string, logo: string) => ({ from: "A", to: "B", departAt: "t", arriveAt: "t", minutes: 1, airline, logo });
    const mixed = renderToStaticMarkup(<AirlineMark offer={{ airline: "Air Canada · United", logo: "https://x/multi.png", legs: [leg("Air Canada", "https://x/ac.png"), leg("United", "https://x/ua.png"), leg("United", "https://x/ua.png")] }} />);
    expect(mixed).toContain("https://x/ac.png");
    expect(mixed).toContain("https://x/ua.png");
    expect(mixed).not.toContain("multi.png");
    expect(mixed.match(/<img/g)).toHaveLength(2); // United flies two legs but shows once
    const single = renderToStaticMarkup(<AirlineMark offer={{ airline: "Air Canada", logo: "https://x/ac.png", legs: [leg("Air Canada", "https://x/ac.png"), leg("Air Canada", "https://x/ac.png")] }} />);
    expect(single.match(/<img/g)).toHaveLength(1);
  });
});
