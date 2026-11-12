import { describe, expect, it } from "vitest";
import { askedCount, stayLimits } from "../../lib/application/constraints";

describe("askedCount", () => {
  it("reads a handful asked for", () => {
    expect(askedCount("best ramen in Toronto, just give me 3")).toBe(3);
    expect(askedCount("top 5 museums")).toBe(5);
    expect(askedCount("only two options please")).toBe(2);
    expect(askedCount("give me three good vegetarian restaurants near the hotel")).toBe(3);
    expect(askedCount("show me 4 cafes")).toBe(4);
  });

  it("is null for days, people and nights, and for numbers that are not a handful", () => {
    expect(askedCount("plan 3 days in Rome")).toBeNull();
    expect(askedCount("there are 4 of us, where should we eat")).toBeNull();
    expect(askedCount("just 2 nights in Lisbon")).toBeNull();
    expect(askedCount("top 10 things to do")).toBeNull();
    expect(askedCount("best ramen in Toronto")).toBeNull();
  });
});

describe("stayLimits", () => {
  it("reads a nightly ceiling in the ways people write it", () => {
    expect(stayLimits("Find me a hotel under $150 a night near the CN Tower").priceMax).toBe(150);
    expect(stayLimits("hotels max 200 per night").priceMax).toBe(200);
    expect(stayLimits("nothing more than €120/night").priceMax).toBe(120);
    expect(stayLimits("a room for 90 a night or less").priceMax).toBe(90);
  });

  it("reads a star floor", () => {
    expect(stayLimits("4 star hotel in Rome")).toEqual({ priceMax: null, minStars: 4 });
    expect(stayLimits("five stars or better").minStars).toBe(5);
  });

  it("finds nothing in an ordinary ask", () => {
    expect(stayLimits("where should we stay in Lisbon")).toEqual({ priceMax: null, minStars: null });
    expect(stayLimits("total budget $600 for two")).toEqual({ priceMax: null, minStars: null });
  });
});
