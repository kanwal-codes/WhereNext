import { describe, expect, it } from "vitest";
import { applyParsedTrip } from "@/features/trip-setup/lib/apply-parsed-trip";

const empty = { name: "", destination: "", origin: "", startDate: "", endDate: "", durationDays: "", useLength: false, travelerCount: "", vibe: "", budget: "", pace: "", transportPreference: "", dietaryNeeds: "" };

describe("applyParsedTrip", () => {
  it("fills the controlled form from parsed trip data", () => {
    expect(applyParsedTrip(empty, { name: "Food weekend", destination: "Montreal", durationDays: 3, travelerCount: 2 })).toMatchObject({ name: "Food weekend", destination: "Montreal", durationDays: "3", useLength: true, travelerCount: "2" });
  });
});
