import { describe, expect, it } from "vitest";
import { readEatAsk, readFlightsAsk, readTime } from "@/lib/application/ask-readers";

// 2026-12-02 is a Wednesday.
const TODAY = "2026-12-02";

describe("readTime", () => {
  it("reads a clock time written plainly", () => {
    expect(readTime("table at 8pm")).toBe("20:00");
    expect(readTime("7:30 PM please")).toBe("19:30");
    expect(readTime("at 19:45")).toBe("19:45");
    expect(readTime("12am")).toBe("00:00");
    expect(readTime("lunch at noon")).toBe("12:00");
  });
  it("leaves a bare hour to the model", () => { expect(readTime("a table at 8")).toBeUndefined(); });
});

describe("readEatAsk", () => {
  it("reads how many, the day and the time, and does not mistake the time for the party", () => {
    expect(readEatAsk("ramen saturday at 8pm for 4", TODAY)).toEqual({ time: "20:00", adults: 4, date: "2026-12-05" });
    expect(readEatAsk("table for two tomorrow 7:30pm", TODAY)).toEqual({ time: "19:30", adults: 2, date: "2026-12-03" });
  });
  it("reads a calendar date and a weekday", () => {
    expect(readEatAsk("dinner dec 12", TODAY).date).toBe("2026-12-12");
    expect(readEatAsk("brunch next saturday", TODAY).date).toBe("2026-12-12");
    expect(readEatAsk("brunch this friday", TODAY).date).toBe("2026-12-04");
  });
  it("takes the weekday named, not today, when it says \"this weekend\" on a Sunday", () => {
    // 2026-11-22 is a Sunday.
    expect(readEatAsk("visiting this weekend, probably around 6pm on saturday", "2026-11-22").date).toBe("2026-11-28");
  });
  it("says nothing about a plain search", () => { expect(readEatAsk("ramen near the market", TODAY)).toEqual({}); });
});

describe("readFlightsAsk", () => {
  it("reads days out and back, the party and one way", () => {
    expect(readFlightsAsk("toronto to lisbon dec 10-17 for 2", TODAY)).toEqual({ depart: "2026-12-10", ret: "2026-12-17", adults: 2 });
    expect(readFlightsAsk("one way dec 10", TODAY)).toEqual({ depart: "2026-12-10", oneWay: true });
    expect(readFlightsAsk("dec 10 for 5 nights", TODAY)).toEqual({ depart: "2026-12-10", ret: "2026-12-15" });
  });
});
