import { describe, expect, it } from "vitest";
import { weatherCardFromForecast } from "@/lib/application/weather-card";
import type { WeatherDay } from "@/packages/providers/openweather/client";

const day = (over: Partial<WeatherDay>): WeatherDay => ({ label: "Mon", min: 5, max: 12, condition: "clouds", wet: false, ...over });

describe("weatherCardFromForecast", () => {
  it("returns null with no days", () => {
    expect(weatherCardFromForecast("Oslo", [])).toBeNull();
  });

  it("averages the trip days and picks the dominant condition", () => {
    const card = weatherCardFromForecast("Montréal", [
      day({ label: "Fri", min: 2, max: 8, condition: "rain", wet: true }),
      day({ label: "Sat", min: 4, max: 10, condition: "rain", wet: true }),
      day({ label: "Sun", min: 3, max: 12, condition: "clouds", wet: false }),
    ])!;
    expect(card.mode).toBe("forecast");
    expect(card.highC).toBe(10); // (8+10+12)/3
    expect(card.lowC).toBe(3); // (2+4+3)/3
    expect(card.condition).toBe("rain");
    expect(card.days).toHaveLength(3);
    expect(card.packing).toContain("Waterproof shell"); // 2 of 3 days wet
    expect(card.headline.toLowerCase()).toContain("wet");
  });

  it("normalises provider condition strings to the 5-way enum", () => {
    const card = weatherCardFromForecast("Reykjavik", [day({ condition: "Snow" }), day({ condition: "light snow" })])!;
    expect(card.days.every((d) => d.condition === "snow")).toBe(true);
  });

  it("warm + dry → light-clothing packing, no waterproof", () => {
    const card = weatherCardFromForecast("Lisbon", [day({ min: 18, max: 28, condition: "clear", wet: false })])!;
    expect(card.condition).toBe("clear");
    expect(card.packing).not.toContain("Waterproof shell");
    expect(card.packing.join(" ").toLowerCase()).toContain("light");
  });
});
