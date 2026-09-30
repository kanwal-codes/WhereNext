import { describe, expect, it } from "vitest";
import { formatTripMemory } from "@/lib/application/trip-context";
import { travelerProfileSchema } from "@/packages/contracts/profile";
import { displayName, fromBrowserLocale } from "@/lib/locales";

describe("language and country", () => {
  it("reads a browser locale, keeping only what we offer", () => {
    expect(fromBrowserLocale("fr-CA")).toEqual({ language: "fr", country: "CA" });
    expect(fromBrowserLocale("en")).toEqual({ language: "en", country: undefined });
    expect(fromBrowserLocale("xx-ZZ")).toEqual({ language: undefined, country: undefined });
  });
  it("names a language in itself", () => {
    expect(displayName("language", "fr", "fr")).toMatch(/fran/i);
  });
  it("keeps both on the profile and upper-cases the country", () => {
    expect(travelerProfileSchema.parse({ language: "hi", country: "in" })).toMatchObject({ language: "hi", country: "IN" });
  });
  it("tells the model about them", () => {
    const memory = formatTripMemory({ preferences: { language: "hi", country: "IN" }, itinerary: [], places: [], decisions: [], lockedTitles: [] } as never);
    expect(memory).toContain("preferred language: hi");
    expect(memory).toContain("home country: IN");
  });
});

import { formatDistanceKm, usesMiles } from "@/lib/application/geo";
import { currencyForCountry } from "@/lib/currency";
import { loadTravellerDefaults, withTravellerDefaults } from "@/lib/server/traveller-defaults";

const fakeSupabase = (profile: Record<string, unknown> | null) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profile ? { data: profile } : null }) }) }) }) }) as never;

describe("what country decides", () => {
  it("uses miles for the US and UK only", () => {
    expect(usesMiles("US")).toBe(true);
    expect(usesMiles("gb")).toBe(true);
    expect(usesMiles("CA")).toBe(false);
    expect(formatDistanceKm(1.6, true)).toBe("1.0 mi");
    expect(formatDistanceKm(0.1, true)).toBe("330 ft");
    expect(formatDistanceKm(1.8)).toBe("1.8 km");
  });
  it("maps a country to its currency", () => {
    expect(currencyForCountry("FR")).toBe("EUR");
    expect(currencyForCountry("jp")).toBe("JPY");
    expect(currencyForCountry("ZZ")).toBeUndefined();
  });
  it("fills only what the trip lacks", () => {
    const merged = withTravellerDefaults({ currency: "USD" }, { language: "fr", country: "CA", currency: "CAD" });
    expect(merged).toEqual({ currency: "USD", language: "fr", country: "CA" });
  });
  it("prefers the profile, then the request", async () => {
    const headers = new Headers({ "accept-language": "de-DE,de;q=0.9", "x-vercel-ip-country": "AT" });
    expect(await loadTravellerDefaults(fakeSupabase({ language: "hi", country: "IN" }), "u", headers)).toEqual({ language: "hi", country: "IN", currency: "INR" });
    expect(await loadTravellerDefaults(fakeSupabase(null), "u", headers)).toEqual({ language: "de", country: "AT", currency: "EUR" });
    expect(await loadTravellerDefaults(fakeSupabase(null), "u")).toEqual({ language: undefined, country: undefined, currency: undefined });
  });
});
