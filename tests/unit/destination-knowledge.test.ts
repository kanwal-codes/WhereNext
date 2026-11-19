import { describe, expect, it } from "vitest";
import { knownAnswer } from "../../lib/application/destination-knowledge";

describe("saved destination facts", () => {
  it("answers a stable question about a known place with its source page", () => {
    const hit = knownAnswer("do you tip in Lisbon restaurants?");
    expect(hit?.[0].url).toBe("https://www.lisbontourism.org/lisbon-travel-tips/");
    expect(hit?.[0].content).toMatch(/5.10%/);
  });

  it("returns every topic asked, and nothing when one is missing", () => {
    expect(knownAnswer("lisbon tipping and tap water")?.length).toBe(2);
    expect(knownAnswer("lisbon tipping and plugs and airport and safety scams tap water bottled")).not.toBeNull();
    expect(knownAnswer("tokyo tap water")).toBeNull(); // we have not read a page on it: search the web
  });

  it("leaves anything that changes or depends on the traveller to the live search", () => {
    expect(knownAnswer("Lisbon visa tipping")).toBeNull();
    expect(knownAnswer("tipping in Lisbon 2027")).toBeNull();
    expect(knownAnswer("Mexico City essentials visa currency etiquette")).toBeNull();
  });

  it("knows nothing about places it has not read up on", () => {
    expect(knownAnswer("tipping in Delhi")).toBeNull();
  });
});
