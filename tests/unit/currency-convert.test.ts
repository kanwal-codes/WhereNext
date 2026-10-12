import { describe, expect, it } from "vitest";
import { formatConversion, parseConversionAsk } from "../../lib/application/currency-convert";

describe("parseConversionAsk", () => {
  it("reads the amounts and the target from a conversion ask", () => {
    expect(parseConversionAsk("Convert 1,184 EUR and 2,200 GBP and 1,860 USD to CAD so I can see how much we have paid so far.", "CAD")).toEqual({
      items: [{ amount: 1184, from: "EUR" }, { amount: 2200, from: "GBP" }, { amount: 1860, from: "USD" }],
      to: "CAD",
    });
  });
  it("understands symbols and words, and defaults to the trip's currency", () => {
    expect(parseConversionAsk("how much is €305 in canadian dollars?", "CAD")).toEqual({ items: [{ amount: 305, from: "EUR" }], to: "CAD" });
    expect(parseConversionAsk("what is £410 in euros", "CAD")).toEqual({ items: [{ amount: 410, from: "GBP" }], to: "EUR" });
    expect(parseConversionAsk("convert 50 euros", "CAD")).toEqual({ items: [{ amount: 50, from: "EUR" }], to: "CAD" });
  });
  it("does not fire on things that are not conversions, or when nothing needs converting", () => {
    expect(parseConversionAsk("What is a good budget of 200 CAD a day in Rome?", "CAD")).toBeNull();
    expect(parseConversionAsk("Where can we eat in Rome for under €25?", "CAD")).toBeNull();
    expect(parseConversionAsk("convert 100 CAD to CAD", "CAD")).toBeNull();
    expect(parseConversionAsk("convert this for me", "CAD")).toBeNull();
  });
});

describe("formatConversion", () => {
  it("lists each amount with its rate and a total", () => {
    const text = formatConversion({ items: [{ amount: 100, from: "EUR" }, { amount: 50, from: "GBP" }], to: "CAD" }, new Map([["EUR", 1.5], ["GBP", 1.8]]));
    expect(text).toContain("≈ CA$150");
    expect(text).toContain("1 EUR = 1.5000 CAD");
    expect(text).toContain("Together ≈ CA$240");
    expect(text).toContain("European Central Bank");
  });
  it("says so when a rate is unavailable instead of guessing, and gives no total", () => {
    const text = formatConversion({ items: [{ amount: 100, from: "EUR" }, { amount: 50, from: "XXX" }], to: "CAD" }, new Map([["EUR", 1.5], ["XXX", null]]));
    expect(text).toContain("couldn’t get a rate for XXX");
    expect(text).not.toContain("Together");
  });
});
