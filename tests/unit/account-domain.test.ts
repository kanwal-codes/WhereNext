import { describe, expect, it } from "vitest";
import { airportCode, avatarProblem, canChangePassword, formPatch, passwordsMatch, pickedAirport, readAirportInput, shareUrl, styleSummary, stylePatch, toggled } from "../../features/profile/domain/account";

describe("airports", () => {
  it("reads a code from a bare code or from the end of a picked name", () => {
    expect(airportCode("yyz")).toBe("YYZ");
    expect(airportCode(" Toronto Pearson International Airport (yyz) ")).toBe("YYZ");
    expect(airportCode("Toronto Pearson")).toBeNull();
    expect(airportCode("YY")).toBeNull();
    expect(airportCode("(YYZ) Toronto")).toBeNull();
  });
  it("capitalises a bare code as it is typed, and says what happens to the saved airport", () => {
    expect(readAirportInput("lhr")).toEqual({ shown: "LHR", airport: "LHR" });
    expect(readAirportInput("Toron")).toEqual({ shown: "Toron", airport: null });
    expect(readAirportInput("  ")).toEqual({ shown: "  ", airport: "" });
    expect(readAirportInput("Heathrow (lhr)")).toEqual({ shown: "Heathrow (lhr)", airport: "LHR" });
  });
  it("shows a picked suggestion with its code, once", () => {
    expect(pickedAirport({ placeId: "YYZ", text: "Toronto Pearson" })).toEqual({ airport: "YYZ", shown: "Toronto Pearson (YYZ)" });
    expect(pickedAirport({ placeId: "YYZ", text: "Toronto Pearson (YYZ)" }).shown).toBe("Toronto Pearson (YYZ)");
  });
});

describe("travel style", () => {
  it("summarises only what was chosen", () => {
    expect(styleSummary({ interests: [], pace: undefined, budget: undefined, companions: "" })).toBe("New trips will lean towards whatever looks good.");
    expect(styleSummary({ interests: ["Hiking", "Food & markets", "Museums", "Beaches"], pace: "Slow", budget: "Lean", companions: "Friends" }))
      .toBe("New trips will lean towards hiking, food & markets, museums, at a slow pace, on a lean budget, usually travelling with friends.");
    expect(styleSummary({ interests: ["Hiking"], pace: undefined, budget: undefined, companions: "Solo" })).toBe("New trips will lean towards hiking, usually travelling solo.");
  });
  it("saves a style, clearing what was unset", () => {
    expect(stylePatch({ interests: ["Hiking"], dietary: ["Vegan"], dietNote: "", pace: undefined, budget: "Lean", stay: "Hotel", companions: "" }))
      .toEqual({ interests: ["Hiking"], dietaryNeeds: ["Vegan"], dietaryNote: undefined, pace: null, budget: "Lean", stayType: "Hotel", groupType: null });
  });
  it("adds or removes a chip", () => {
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("saving the form, passwords and photos", () => {
  it("leaves empty fields out of the saved profile", () => {
    expect(formPatch({ airport: "", city: "Paris", language: "", country: "FR", bio: "", notifications: { trips: true } })).toEqual({
      homeAirport: undefined, homeCity: "Paris", language: undefined, country: "FR", bio: undefined, notifications: { trips: true },
    });
  });
  it("needs eight characters typed twice the same", () => {
    expect([canChangePassword("short", "short"), canChangePassword("longenough", "different1"), canChangePassword("longenough", "longenough")]).toEqual([false, false, true]);
    expect([passwordsMatch("abc", ""), passwordsMatch("abc", "abc"), passwordsMatch("abc", "ab")]).toEqual([true, true, false]);
  });
  it("checks a chosen photo's type and size", () => {
    const types = ["image/png"];
    expect(avatarProblem({ type: "application/pdf", size: 10 }, types)).toMatch(/Choose a JPEG/);
    expect(avatarProblem({ type: "image/png", size: 5 * 1024 * 1024 + 1 }, types)).toBe("Keep it under 5MB.");
    expect(avatarProblem({ type: "image/png", size: 5 * 1024 * 1024 }, types)).toBeNull();
  });
  it("builds a share link", () => {
    expect(shareUrl("https://app.test", "abc")).toBe("https://app.test/s/abc");
  });
});
