import { describe, expect, it } from "vitest";
import { homeAirportFromHeaders, nearestAirport } from "../../lib/landing/nearest-airport";
import { guessHomeCode } from "../../lib/landing/airports";

describe("nearestAirport", () => {
  it("picks the nearest main airport for real places", () => {
    expect(nearestAirport(43.73, -79.76)).toBe("YYZ"); // Brampton
    expect(nearestAirport(53.55, -113.49)).toBe("YEG"); // Edmonton (a time zone alone gave Calgary)
    expect(nearestAirport(51.05, -114.07)).toBe("YYC"); // Calgary
    expect(nearestAirport(40.65, -73.95)).toBe("JFK"); // Brooklyn
    expect(nearestAirport(42.36, -71.06)).toBe("BOS"); // Boston (same time zone as New York)
    expect(nearestAirport(37.77, -122.42)).toBe("SFO"); // San Francisco (same zone as Los Angeles)
    expect(nearestAirport(47.61, -122.33)).toBe("SEA");
    expect(nearestAirport(29.76, -95.37)).toBe("IAH"); // Houston (same zone as Chicago)
    expect(nearestAirport(38.72, -9.14)).toBe("LIS");
    expect(nearestAirport(35.68, 139.69)).toBe("HND"); // Tokyo
    expect(nearestAirport(-33.87, 151.21)).toBe("SYD");
  });

  it("says nothing when no airport is near, or the point is not a place", () => {
    expect(nearestAirport(0, -30)).toBeNull(); // mid-Atlantic
    expect(nearestAirport(Number.NaN, 10)).toBeNull();
    expect(nearestAirport(95, 10)).toBeNull();
  });
});

describe("homeAirportFromHeaders", () => {
  const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name] ?? null });

  it("reads the platform's latitude and longitude headers", () => {
    expect(homeAirportFromHeaders(headers({ "x-vercel-ip-latitude": "43.7315", "x-vercel-ip-longitude": "-79.7624" }))).toBe("YYZ");
  });

  it("is null without them, so the time zone guess takes over", () => {
    expect(homeAirportFromHeaders(headers({}))).toBeNull();
    expect(homeAirportFromHeaders(headers({ "x-vercel-ip-latitude": "", "x-vercel-ip-longitude": "" }))).toBeNull();
    expect(homeAirportFromHeaders(headers({ "x-vercel-ip-latitude": "abc", "x-vercel-ip-longitude": "10" }))).toBeNull();
  });
});

describe("guessHomeCode (the fallback)", () => {
  it("gives an airport code for a known zone, never a city code", () => {
    const original = Intl.DateTimeFormat;
    // The zones that used to give NYC / CHI / LON.
    for (const [zone, code] of [["America/New_York", "JFK"], ["America/Chicago", "ORD"], ["Europe/London", "LHR"], ["America/Edmonton", "YEG"]] as const) {
      Intl.DateTimeFormat = (() => ({ resolvedOptions: () => ({ timeZone: zone }) })) as unknown as typeof Intl.DateTimeFormat;
      expect(guessHomeCode()).toBe(code);
    }
    Intl.DateTimeFormat = original;
  });
});
